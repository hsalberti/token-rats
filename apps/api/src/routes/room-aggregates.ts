/**
 * Public room aggregate endpoints — mounted at /v1/r.
 *
 *   GET /v1/r/:code/summary       — Members · 30d tokens · 30d cost.
 *                                   Auth optional; aggregates are intentionally
 *                                   public to anyone with the room URL.
 *   GET /v1/r/:code/heatmap       — 30d|52w bucket data for the group heatmap.
 *                                   Auth required for private rooms; open for
 *                                   public rooms (feature #6).
 *   GET /v1/r/:code/group-streak  — current consecutive-day count where ≥1
 *                                   member had tokens > 0 (UTC). Excludes today.
 *                                   Same visibility as heatmap.
 *
 * These live in their own router (`/v1/r`, not `/v1/rooms`) to keep the
 * member-gated routes in `rooms.ts` cleanly separated. The aggregates are
 * the only room routes that bypass the membership check by design.
 *
 * SCHEMA LIMITATION: `daily_rollup` has no room dimension — it's keyed by
 * (user_id, day) over a user's ENTIRE activity. Every aggregate below joins
 * `room_members` only to pick WHICH users to sum; the tokens/sessions/streak
 * values are each member's account-wide totals, not activity scoped to this
 * room. A member who burns tokens in solo work (no room) still moves these
 * numbers. Honest fix only: the API responses and web copy label these as
 * account-wide. A genuinely room-scoped aggregate needs a room dimension on the
 * rollup (or sessions) — deliberately NOT attempted here.
 */
import { Hono } from "hono";
import type { Env } from "../env.js";
import { notFound } from "../lib/errors.js";
import type { AuthVariables } from "../middleware/auth.js";
import { optionalAuth } from "../middleware/auth.js";

type HonoEnv = { Bindings: Env; Variables: AuthVariables };

const roomAggregates = new Hono<HonoEnv>();

/** Yesterday in YYYY-MM-DD UTC. */
function yesterdayUtc(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Look up a room by code. Returns null if no such room.
 *
 * `is_public` and `country` are SELECTed but defaulted to 0/NULL when the
 * underlying columns don't exist yet — they're added in feature #6's
 * migration. Until then we treat every room as private.
 */
async function findRoom(
  db: D1Database,
  code: string,
): Promise<{
  id: string;
  code: string;
  name: string;
  is_public: number;
  country: string | null;
} | null> {
  // Try the post-feature-#6 shape first; on schema mismatch, fall back.
  try {
    const r = await db
      .prepare(
        "SELECT id, code, name, COALESCE(is_public, 0) AS is_public, country FROM rooms WHERE code = ?",
      )
      .bind(code)
      .first<{
        id: string;
        code: string;
        name: string;
        is_public: number;
        country: string | null;
      }>();
    return r ?? null;
  } catch {
    const r = await db
      .prepare("SELECT id, code, name FROM rooms WHERE code = ?")
      .bind(code)
      .first<{ id: string; code: string; name: string }>();
    if (!r) return null;
    return { ...r, is_public: 0, country: null };
  }
}

/** True iff the user is a member of the room. */
async function isMember(db: D1Database, roomId: string, userId: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?")
    .bind(roomId, userId)
    .first<{ 1: number }>();
  return row !== null;
}

/* -------------------------------------------------------------------------- */
/* GET /v1/r/:code/summary                                                    */
/* -------------------------------------------------------------------------- */

roomAggregates.get("/:code/summary", optionalAuth, async (c) => {
  const code = c.req.param("code");
  const room = await findRoom(c.env.DB, code);
  if (!room) return notFound(c, "Room not found");

  // 30-day window: trailing 30 days inclusive of today.
  const today = new Date();
  const from = new Date(today);
  from.setUTCDate(from.getUTCDate() - 29);
  const fromDay = from.toISOString().slice(0, 10);

  const memberCountRow = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM room_members WHERE room_id = ?",
  )
    .bind(room.id)
    .first<{ n: number }>();

  const totals = await c.env.DB.prepare(
    `SELECT COALESCE(SUM(dr.tokens), 0)         AS tokens,
            COALESCE(SUM(dr.cost_usd_cents), 0) AS cost
       FROM daily_rollup dr
       JOIN room_members rm
         ON rm.user_id = dr.user_id AND rm.room_id = ?
      WHERE dr.day >= ?`,
  )
    .bind(room.id, fromDay)
    .first<{ tokens: number; cost: number }>();

  return c.json({
    summary: {
      code: room.code,
      name: room.name,
      isPublic: room.is_public === 1,
      country: room.country,
      memberCount: memberCountRow?.n ?? 0,
      total30dTokens: totals?.tokens ?? 0,
      total30dCostUsdCents: totals?.cost ?? 0,
    },
  });
});

/* -------------------------------------------------------------------------- */
/* GET /v1/r/:code/heatmap?range=30d|52w                                      */
/* -------------------------------------------------------------------------- */

roomAggregates.get("/:code/heatmap", optionalAuth, async (c) => {
  const code = c.req.param("code");
  const room = await findRoom(c.env.DB, code);
  if (!room) return notFound(c, "Room not found");

  // Visibility: public rooms (feature #6) are open; private rooms require
  // an authed member. We surface a 404 on private+non-member to avoid
  // leaking whether the room exists at all to the unauthed caller.
  if (room.is_public !== 1) {
    const userId = c.var.userId ?? null;
    if (!userId || !(await isMember(c.env.DB, room.id, userId))) {
      return notFound(c, "Room not found");
    }
  }

  const rangeParam = new URL(c.req.url).searchParams.get("range") ?? "30d";
  const range: "30d" | "52w" = rangeParam === "52w" ? "52w" : "30d";
  const daysBack = range === "52w" ? 363 : 29;

  const today = new Date();
  const from = new Date(today);
  from.setUTCDate(from.getUTCDate() - daysBack);
  const fromDay = from.toISOString().slice(0, 10);

  const result = await c.env.DB.prepare(
    `SELECT dr.day,
            SUM(dr.tokens)   AS tokens,
            SUM(dr.sessions) AS sessions
       FROM daily_rollup dr
       JOIN room_members rm
         ON rm.user_id = dr.user_id AND rm.room_id = ?
      WHERE dr.day >= ?
      GROUP BY dr.day
      ORDER BY dr.day`,
  )
    .bind(room.id, fromDay)
    .all<{ day: string; tokens: number; sessions: number }>();

  const days = (result.results ?? []).map((r) => ({
    day: r.day,
    tokens: r.tokens,
    sessions: r.sessions,
  }));

  return c.json({
    heatmap: {
      range,
      from: fromDay,
      to: today.toISOString().slice(0, 10),
      days,
    },
  });
});

/* -------------------------------------------------------------------------- */
/* GET /v1/r/:code/group-streak                                               */
/* -------------------------------------------------------------------------- */

roomAggregates.get("/:code/group-streak", optionalAuth, async (c) => {
  const code = c.req.param("code");
  const room = await findRoom(c.env.DB, code);
  if (!room) return notFound(c, "Room not found");

  if (room.is_public !== 1) {
    const userId = c.var.userId ?? null;
    if (!userId || !(await isMember(c.env.DB, room.id, userId))) {
      return notFound(c, "Room not found");
    }
  }

  // Pull the last 180 days of distinct "active" group days (≥1 member with
  // tokens > 0), excluding today. We walk back from yesterday counting
  // consecutive days. 180 is a soft cap — any longer streak gets clipped to
  // 180 in this endpoint; lift if it matters.
  const asOf = yesterdayUtc();
  const fromCap = new Date(`${asOf}T00:00:00Z`);
  fromCap.setUTCDate(fromCap.getUTCDate() - 179);
  const fromDay = fromCap.toISOString().slice(0, 10);

  const result = await c.env.DB.prepare(
    `SELECT DISTINCT dr.day AS day
       FROM daily_rollup dr
       JOIN room_members rm
         ON rm.user_id = dr.user_id AND rm.room_id = ?
      WHERE dr.tokens > 0
        AND dr.day >= ?
        AND dr.day <= ?
      ORDER BY dr.day DESC`,
  )
    .bind(room.id, fromDay, asOf)
    .all<{ day: string }>();

  const activeDays = new Set((result.results ?? []).map((r) => r.day));

  let currentStreak = 0;
  const cursor = new Date(`${asOf}T00:00:00Z`);
  while (currentStreak < 180) {
    const dayStr = cursor.toISOString().slice(0, 10);
    if (!activeDays.has(dayStr)) break;
    currentStreak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  return c.json({
    groupStreak: {
      currentStreak,
      asOf,
    },
  });
});

export default roomAggregates;
