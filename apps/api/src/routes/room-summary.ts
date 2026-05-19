/**
 * GET /v1/rooms/:code/summary?range=today|7d|30d|all
 *
 * v1.2 Track Y — room stat strip data. Member-gated (404 to non-members).
 *
 * Aggregates daily_rollup for headline totals + activeMembers/dayCount and
 * pulls model/source mix from the `sessions` table (daily_rollup has no model
 * or source column).
 *
 * Cached in KV under `rs:{code}:{range}` with a 60s TTL. Same invalidation
 * point as the leaderboard cache (see lib/cache-bust.ts or rooms.ts).
 */
import { Hono } from "hono";
import { LeaderboardRange } from "@token-rats/contracts";
import type { LeaderboardRange as LeaderboardRangeT, RoomSummary } from "@token-rats/contracts";
import { z } from "zod";
import type { Env } from "../env.js";
import type { AuthVariables } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";
import { notFound, validationError } from "../lib/errors.js";

type HonoEnv = { Bindings: Env; Variables: AuthVariables };

const roomSummary = new Hono<HonoEnv>();

const SummaryQuery = z.object({
  range: LeaderboardRange.default("7d"),
});

/** Return the SQL date filter clause + bind values for a given range. */
function dateFilter(
  range: LeaderboardRangeT,
  todayUtc: string,
): { clause: string; params: string[] } {
  if (range === "today") return { clause: "AND day = ?", params: [todayUtc] };
  if (range === "7d") return { clause: "AND day >= ?", params: [offsetDay(todayUtc, -6)] };
  if (range === "30d") return { clause: "AND day >= ?", params: [offsetDay(todayUtc, -29)] };
  return { clause: "", params: [] };
}

/** Sessions-table date filter: column is `started_at` (unix ms). */
function sessionDateFilter(
  range: LeaderboardRangeT,
  todayUtc: string,
): { clause: string; params: number[] } {
  if (range === "all") return { clause: "", params: [] };
  if (range === "today") {
    const start = Date.parse(`${todayUtc}T00:00:00Z`);
    return { clause: "AND s.started_at >= ?", params: [start] };
  }
  if (range === "7d") {
    const start = Date.parse(`${offsetDay(todayUtc, -6)}T00:00:00Z`);
    return { clause: "AND s.started_at >= ?", params: [start] };
  }
  // 30d
  const start = Date.parse(`${offsetDay(todayUtc, -29)}T00:00:00Z`);
  return { clause: "AND s.started_at >= ?", params: [start] };
}

function offsetDay(yyyy_mm_dd: string, days: number): string {
  const d = new Date(`${yyyy_mm_dd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Slice and percentage-bin the top-3 entries of a (name, cost) table. */
function topMix(
  entries: { name: string; costUsdCents: number }[],
): { name: string; costUsdCents: number; sharePct: number }[] {
  const total = entries.reduce((s, e) => s + e.costUsdCents, 0);
  return entries
    .slice(0, 3)
    .map((e) => ({
      ...e,
      sharePct: total === 0 ? 0 : Math.round((e.costUsdCents / total) * 1000) / 10,
    }));
}

roomSummary.get("/:code/summary", requireAuth, async (c) => {
  const userId = c.var.userId;
  const code = c.req.param("code");

  let parsed: { range: LeaderboardRangeT };
  try {
    const raw = Object.fromEntries(new URL(c.req.url).searchParams.entries());
    parsed = SummaryQuery.parse(raw);
  } catch (e) {
    return validationError(c, e instanceof Error ? e.message : e);
  }

  const { range } = parsed;

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

  const cacheKey = `rs:${room.code}:${range}`;
  const cached = await c.env.CACHE.get(cacheKey);
  if (cached) return c.json(JSON.parse(cached));

  const todayUtc = new Date().toISOString().slice(0, 10);
  const { clause: rollupClause, params: rollupParams } = dateFilter(range, todayUtc);
  const { clause: sessClause, params: sessParams } = sessionDateFilter(range, todayUtc);

  // Aggregate totals + dayCount + per-member contribution from daily_rollup.
  const perMember = await c.env.DB.prepare(
    `SELECT rm.user_id,
            COALESCE(SUM(dr.tokens), 0)         AS tokens,
            COALESCE(SUM(dr.cost_usd_cents), 0) AS cost_usd_cents,
            COUNT(DISTINCT dr.day)              AS day_count
       FROM room_members rm
       LEFT JOIN daily_rollup dr
         ON dr.user_id = rm.user_id
         ${rollupClause}
      WHERE rm.room_id = ?
      GROUP BY rm.user_id`,
  )
    .bind(...rollupParams, room.id)
    .all<{
      user_id: string;
      tokens: number;
      cost_usd_cents: number;
      day_count: number;
    }>();

  let totalTokens = 0;
  let totalCostUsdCents = 0;
  let activeMembers = 0;
  let topContributorCost = 0;

  for (const r of perMember.results ?? []) {
    totalTokens += r.tokens;
    totalCostUsdCents += r.cost_usd_cents;
    if (r.day_count > 0 || r.tokens > 0) activeMembers++;
    if (r.cost_usd_cents > topContributorCost) topContributorCost = r.cost_usd_cents;
  }

  // dayCount across the room = distinct days where at least one member had a row.
  const dayCountRow = await c.env.DB.prepare(
    `SELECT COUNT(DISTINCT dr.day) AS day_count
       FROM daily_rollup dr
       JOIN room_members rm ON rm.user_id = dr.user_id
      WHERE rm.room_id = ?
      ${rollupClause}`,
  )
    .bind(room.id, ...rollupParams)
    .first<{ day_count: number }>();

  const dayCount = dayCountRow?.day_count ?? 0;

  // Model mix from `sessions` table (joined to room_members).
  const modelRows = await c.env.DB.prepare(
    `SELECT s.model AS name,
            COALESCE(SUM(s.cost_usd_cents), 0) AS cost
       FROM sessions s
       JOIN room_members rm ON rm.user_id = s.user_id
      WHERE rm.room_id = ?
      ${sessClause}
      GROUP BY s.model
      ORDER BY cost DESC
      LIMIT 16`,
  )
    .bind(room.id, ...sessParams)
    .all<{ name: string; cost: number }>();

  // Source mix from `sessions` table.
  const sourceRows = await c.env.DB.prepare(
    `SELECT s.source AS name,
            COALESCE(SUM(s.cost_usd_cents), 0) AS cost
       FROM sessions s
       JOIN room_members rm ON rm.user_id = s.user_id
      WHERE rm.room_id = ?
      ${sessClause}
      GROUP BY s.source
      ORDER BY cost DESC
      LIMIT 16`,
  )
    .bind(room.id, ...sessParams)
    .all<{ name: string; cost: number }>();

  const modelMix = topMix(
    (modelRows.results ?? []).map((r) => ({ name: r.name, costUsdCents: r.cost })),
  ).map((m) => ({ model: m.name, costUsdCents: m.costUsdCents, sharePct: m.sharePct }));

  const sourceMix = topMix(
    (sourceRows.results ?? []).map((r) => ({ name: r.name, costUsdCents: r.cost })),
  ).map((m) => ({ source: m.name, costUsdCents: m.costUsdCents, sharePct: m.sharePct }));

  const topContributorSharePct =
    totalCostUsdCents === 0
      ? 0
      : Math.round((topContributorCost / totalCostUsdCents) * 1000) / 10;

  const summary: RoomSummary = {
    range,
    totalCostUsdCents,
    totalTokens,
    activeMembers,
    dayCount,
    topContributorSharePct,
    modelMix,
    sourceMix,
    generatedAt: Date.now(),
  };

  const response = { summary };
  await c.env.CACHE.put(cacheKey, JSON.stringify(response), { expirationTtl: 60 });
  return c.json(response);
});

export default roomSummary;
