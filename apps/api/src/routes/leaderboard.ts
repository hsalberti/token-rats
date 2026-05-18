/**
 * GET /v1/rooms/:code/leaderboard?range=today|7d|30d|all
 *
 * Aggregates daily_rollup for the room's members.
 * Cached in KV under `lb:<code>:<range>` with a 60s TTL (KV's minimum).
 */
import { Hono } from "hono";
import { GetLeaderboardQuery } from "@token-rats/contracts";
import type { LeaderboardRange } from "@token-rats/contracts";
import type { Env } from "../env.js";
import type { AuthVariables } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";
import { validationError, notFound, forbidden } from "../lib/errors.js";

type HonoEnv = { Bindings: Env; Variables: AuthVariables };

const leaderboard = new Hono<HonoEnv>();

/** Return the SQL date filter clause and bind values for a given range. */
function dateFilter(
  range: LeaderboardRange,
  todayUtc: string,
): { clause: string; params: string[] } {
  if (range === "today") {
    return { clause: "AND dr.day = ?", params: [todayUtc] };
  }
  if (range === "7d") {
    // today - 6 days  (inclusive = 7 days total)
    const from = offsetDay(todayUtc, -6);
    return { clause: "AND dr.day >= ?", params: [from] };
  }
  if (range === "30d") {
    const from = offsetDay(todayUtc, -29);
    return { clause: "AND dr.day >= ?", params: [from] };
  }
  // "all" — no date filter
  return { clause: "", params: [] };
}

/** Offset a YYYY-MM-DD string by `days` days. */
function offsetDay(yyyy_mm_dd: string, days: number): string {
  const d = new Date(`${yyyy_mm_dd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

leaderboard.get("/:code/leaderboard", requireAuth, async (c) => {
  const userId = c.var.userId;
  const code = c.req.param("code");

  // Validate query
  let query: { range: LeaderboardRange };
  try {
    const raw = Object.fromEntries(new URL(c.req.url).searchParams.entries());
    query = GetLeaderboardQuery.parse(raw);
  } catch (e) {
    return validationError(c, e instanceof Error ? e.message : e);
  }

  const { range } = query;

  // Find room
  const room = await c.env.DB.prepare("SELECT id FROM rooms WHERE code = ?")
    .bind(code)
    .first<{ id: string }>();

  if (!room) {
    return notFound(c, "Room not found");
  }

  // Check membership
  const membership = await c.env.DB.prepare(
    "SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?",
  )
    .bind(room.id, userId)
    .first();

  if (!membership) {
    return forbidden(c, "You are not a member of this room");
  }

  // Check KV cache
  const cacheKey = `lb:${code}:${range}`;
  const cached = await c.env.CACHE.get(cacheKey);
  if (cached) {
    return c.json(JSON.parse(cached));
  }

  // Build and run the query
  const todayUtc = new Date().toISOString().slice(0, 10);
  const { clause, params } = dateFilter(range, todayUtc);

  const sql = `
    SELECT
      u.id          AS user_id,
      u.handle,
      u.avatar_url,
      COALESCE(SUM(dr.tokens), 0)         AS tokens,
      COALESCE(SUM(dr.cost_usd_cents), 0) AS cost_usd_cents,
      COALESCE(SUM(dr.sessions), 0)       AS sessions
    FROM room_members rm
    JOIN users u ON u.id = rm.user_id
    LEFT JOIN daily_rollup dr
      ON dr.user_id = rm.user_id
      ${clause}
    WHERE rm.room_id = ?
    GROUP BY u.id
    ORDER BY tokens DESC
  `;

  const stmt = c.env.DB.prepare(sql).bind(...params, room.id);
  const result = await stmt.all<{
    user_id: string;
    handle: string;
    avatar_url: string | null;
    tokens: number;
    cost_usd_cents: number;
    sessions: number;
  }>();

  // Per-user source breakdown — reads `sessions` (daily_rollup has no source
  // column). One row per (user, source). We take the top 2 per user in JS
  // since SQLite lacks a portable per-group LIMIT.
  // Note: date range isn't applied here — top-2 reflects all-time dominance,
  // which is what the "this user is mostly a Claude Code person" tag should
  // signal regardless of the leaderboard window being inspected.
  const sourcesResult = await c.env.DB.prepare(
    `SELECT s.user_id,
            s.source,
            SUM(s.in_tokens + s.out_tokens) AS tokens
       FROM sessions s
       JOIN room_members rm ON rm.user_id = s.user_id
      WHERE rm.room_id = ?
      GROUP BY s.user_id, s.source
      ORDER BY s.user_id, tokens DESC`,
  )
    .bind(room.id)
    .all<{ user_id: string; source: string; tokens: number }>();

  const top2ByUser = new Map<string, { source: string; tokens: number }[]>();
  for (const r of sourcesResult.results ?? []) {
    const list = top2ByUser.get(r.user_id) ?? [];
    if (list.length < 2) list.push({ source: r.source, tokens: r.tokens });
    top2ByUser.set(r.user_id, list);
  }

  const rows = (result.results ?? []).map((r, i) => ({
    rank: i + 1,
    userId: r.user_id,
    handle: r.handle,
    avatarUrl: r.avatar_url,
    tokens: r.tokens,
    costUsdCents: r.cost_usd_cents,
    sessions: r.sessions,
    topSources: top2ByUser.get(r.user_id) ?? [],
  }));

  const generatedAt = Date.now();
  const response = {
    leaderboard: {
      range,
      generatedAt,
      rows,
    },
  };

  // Cache for 60s — KV's minimum TTL.
  await c.env.CACHE.put(cacheKey, JSON.stringify(response), {
    expirationTtl: 60,
  });

  return c.json(response);
});

export default leaderboard;
