import { HeatmapRangeDays, HeatmapScope } from "@token-rats/contracts";
import type { HeatmapResponse } from "@token-rats/contracts";
/**
 * GET /v1/heatmap?scope=user|room&id=<handle|code>&days=60|364
 *
 * v1.2 Track Y — generalized heatmap endpoint.
 *
 * - scope=user → public profile heatmap. Visibility follows `users.public_profile`.
 * - scope=room → group heatmap, member-gated (404 to non-members).
 *
 * Levels are quartiles of the *non-zero* days for the scope, so a quiet
 * profile and a heavy room each render with a meaningful intensity ladder.
 *
 * Cached in KV under `hm:{scope}:{id}:{days}` with a 60s TTL.
 */
import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../env.js";
import { notFound, validationError } from "../lib/errors.js";
import { binCells, denseDays, offsetDay } from "../lib/heatmap.js";
import type { AuthVariables } from "../middleware/auth.js";
import { optionalAuth } from "../middleware/auth.js";

type HonoEnv = { Bindings: Env; Variables: AuthVariables };
type Ctx = Context<HonoEnv>;

const heatmap = new Hono<HonoEnv>();

const HeatmapQuery = z.object({
  scope: HeatmapScope,
  id: z.string().min(1).max(100),
  days: z.coerce.number().pipe(HeatmapRangeDays).default(60),
});

/* -------------------------------------------------------------------------- */
/* Shared D1 reader                                                            */
/* -------------------------------------------------------------------------- */

interface DayRow {
  day: string;
  tokens: number;
  costUsdCents: number;
}

/**
 * Read aggregated daily totals for either a single user (scope=user) or every
 * member of a room (scope=room). Days with no rollup row are omitted; the
 * caller fills zeros via `denseDays`.
 */
export async function readDayRows(
  env: Env,
  scope: "user" | "room",
  ownerId: string,
  fromDay: string,
): Promise<DayRow[]> {
  if (scope === "user") {
    const result = await env.DB.prepare(
      `SELECT day,
              COALESCE(SUM(tokens), 0)         AS tokens,
              COALESCE(SUM(cost_usd_cents), 0) AS cost_usd_cents
         FROM daily_rollup
        WHERE user_id = ? AND day >= ?
        GROUP BY day
        ORDER BY day`,
    )
      .bind(ownerId, fromDay)
      .all<{ day: string; tokens: number; cost_usd_cents: number }>();

    return (result.results ?? []).map((r) => ({
      day: r.day,
      tokens: r.tokens,
      costUsdCents: r.cost_usd_cents,
    }));
  }

  // scope === "room"
  const result = await env.DB.prepare(
    `SELECT dr.day,
            COALESCE(SUM(dr.tokens), 0)         AS tokens,
            COALESCE(SUM(dr.cost_usd_cents), 0) AS cost_usd_cents
       FROM daily_rollup dr
       JOIN room_members rm ON rm.user_id = dr.user_id
      WHERE rm.room_id = ? AND dr.day >= ?
      GROUP BY dr.day
      ORDER BY dr.day`,
  )
    .bind(ownerId, fromDay)
    .all<{ day: string; tokens: number; cost_usd_cents: number }>();

  return (result.results ?? []).map((r) => ({
    day: r.day,
    tokens: r.tokens,
    costUsdCents: r.cost_usd_cents,
  }));
}

/**
 * Compute the canonical HeatmapResponse for a scope. Public so the legacy
 * `/v1/u/:handle/heatmap` profile route can reuse it.
 */
export async function buildHeatmapResponse(
  env: Env,
  scope: "user" | "room",
  /** When scope=user this is user_id; when scope=room this is room_id. */
  ownerId: string,
  /** Public identifier echoed in the response (handle or room code). */
  publicId: string,
  rangeDays: 60 | 364,
): Promise<HeatmapResponse> {
  const today = new Date();
  const toDay = today.toISOString().slice(0, 10);
  const fromDay = offsetDay(toDay, -(rangeDays - 1));

  const dayRows = await readDayRows(env, scope, ownerId, fromDay);
  const dense = denseDays(fromDay, toDay, dayRows);
  const cells = binCells(dense);

  return {
    scope,
    id: publicId,
    from: fromDay,
    to: toDay,
    rangeDays,
    cells,
  };
}

/* -------------------------------------------------------------------------- */
/* GET /v1/heatmap                                                             */
/* -------------------------------------------------------------------------- */

heatmap.get("/heatmap", optionalAuth, async (c) => {
  let parsed: z.infer<typeof HeatmapQuery>;
  try {
    const raw = Object.fromEntries(new URL(c.req.url).searchParams.entries());
    parsed = HeatmapQuery.parse(raw);
  } catch (e) {
    return validationError(c, e instanceof Error ? e.message : e);
  }

  if (parsed.scope === "room") {
    return roomHeatmap(c, parsed.id, parsed.days as 60 | 364);
  }
  return userHeatmap(c, parsed.id, parsed.days as 60 | 364);
});

async function userHeatmap(c: Ctx, handle: string, days: 60 | 364): Promise<Response> {
  const user = await c.env.DB.prepare("SELECT id, public_profile FROM users WHERE handle = ?")
    .bind(handle)
    .first<{ id: string; public_profile: number }>();

  if (!user) return notFound(c, "User not found");

  const banned = await c.env.CACHE.get(`banned:handle:${handle.toLowerCase()}`);
  if (banned !== null) return notFound(c, "User not found");

  const callerId = c.var.userId ?? null;
  if (user.public_profile !== 1 && callerId !== user.id) {
    return notFound(c, "This profile is private");
  }

  const cacheKey = `hm:user:${handle}:${days}`;
  const cached = await c.env.CACHE.get(cacheKey);
  if (cached) {
    return c.json(JSON.parse(cached));
  }

  const response = await buildHeatmapResponse(c.env, "user", user.id, handle, days);
  await c.env.CACHE.put(cacheKey, JSON.stringify(response), { expirationTtl: 60 });
  return c.json(response);
}

async function roomHeatmap(c: Ctx, code: string, days: 60 | 364): Promise<Response> {
  const userId = c.var.userId;
  // Member-gated: 404 to anyone who can't view (consistent with leaderboard).
  if (!userId) return notFound(c, "Room not found");

  const room = await c.env.DB.prepare("SELECT id, code FROM rooms WHERE code = ?")
    .bind(code)
    .first<{ id: string; code: string }>();

  if (!room) return notFound(c, "Room not found");

  const membership = await c.env.DB.prepare(
    "SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?",
  )
    .bind(room.id, userId)
    .first();

  if (!membership) return notFound(c, "Room not found");

  const cacheKey = `hm:room:${room.code}:${days}`;
  const cached = await c.env.CACHE.get(cacheKey);
  if (cached) {
    return c.json(JSON.parse(cached));
  }

  const response = await buildHeatmapResponse(c.env, "room", room.id, room.code, days);
  await c.env.CACHE.put(cacheKey, JSON.stringify(response), { expirationTtl: 60 });
  return c.json(response);
}

export default heatmap;
