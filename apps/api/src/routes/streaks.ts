/**
 * Streak routes:
 *   GET /v1/rooms/:code/streaks — per-user-per-room streak computation
 *
 * Streaks are computed on-demand from daily_rollup + room_members.
 * Definition: consecutive UTC days where the user has ≥1 session AND
 * is a member of the room.
 *
 * The SQL approach:
 *   1. Fetch all distinct days each room member had activity (from daily_rollup).
 *   2. For each user, walk the sorted days list to compute current + longest streak.
 *
 * We pull all per-member day rows and compute streaks in JS — this keeps the
 * SQL simple and avoids window function limitations in D1 (SQLite).
 */
import { Hono } from "hono";
import type { Env } from "../env.js";
import { forbidden, notFound } from "../lib/errors.js";
import type { AuthVariables } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";

type HonoEnv = { Bindings: Env; Variables: AuthVariables };

const streaks = new Hono<HonoEnv>();

/** Compute current streak and longest streak from a sorted (ASC) list of YYYY-MM-DD strings. */
export function computeStreaks(
  days: string[],
  todayUtc: string,
): { currentStreak: number; longestStreak: number } {
  if (days.length === 0) return { currentStreak: 0, longestStreak: 0 };

  let longestStreak = 1;
  let runLen = 1;

  for (let i = 1; i < days.length; i++) {
    const prev = new Date(`${days[i - 1]}T00:00:00Z`);
    const curr = new Date(`${days[i]}T00:00:00Z`);
    const diffDays = Math.round((curr.getTime() - prev.getTime()) / 86_400_000);
    if (diffDays === 1) {
      runLen++;
      if (runLen > longestStreak) longestStreak = runLen;
    } else {
      runLen = 1;
    }
  }

  // Current streak: most-recent run, but only if it includes today or yesterday
  // (to keep the streak alive until the next UTC midnight)
  const lastDay = days[days.length - 1];
  const yesterday = (() => {
    const d = new Date(`${todayUtc}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  })();

  if (lastDay !== todayUtc && lastDay !== yesterday) {
    // Streak is broken — hasn't synced today or yesterday
    return { currentStreak: 0, longestStreak };
  }

  // Walk back to find the length of the trailing consecutive run
  let currentStreak = 1;
  for (let i = days.length - 1; i >= 1; i--) {
    const prev = new Date(`${days[i - 1]}T00:00:00Z`);
    const curr = new Date(`${days[i]}T00:00:00Z`);
    const diffDays = Math.round((curr.getTime() - prev.getTime()) / 86_400_000);
    if (diffDays === 1) {
      currentStreak++;
    } else {
      break;
    }
  }

  return { currentStreak, longestStreak: Math.max(longestStreak, currentStreak) };
}

/* -------------------------------------------------------------------------- */
/* GET /v1/rooms/:code/streaks                                                 */
/* -------------------------------------------------------------------------- */

streaks.get("/:code/streaks", requireAuth, async (c) => {
  const userId = c.var.userId;
  const code = c.req.param("code");

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

  // Fetch all days each room member had activity, ordered per user then by day ASC
  const result = await c.env.DB.prepare(
    `SELECT
       rm.user_id,
       u.handle,
       u.avatar_url,
       dr.day
     FROM room_members rm
     JOIN users u ON u.id = rm.user_id
     LEFT JOIN daily_rollup dr
       ON dr.user_id = rm.user_id
       AND dr.sessions > 0
     WHERE rm.room_id = ?
     ORDER BY rm.user_id, dr.day ASC`,
  )
    .bind(room.id)
    .all<{
      user_id: string;
      handle: string;
      avatar_url: string | null;
      day: string | null;
    }>();

  // Group rows by user
  type UserAccum = {
    userId: string;
    handle: string;
    avatarUrl: string | null;
    days: string[];
  };
  const userMap = new Map<string, UserAccum>();

  for (const row of result.results ?? []) {
    let entry = userMap.get(row.user_id);
    if (!entry) {
      entry = {
        userId: row.user_id,
        handle: row.handle,
        avatarUrl: row.avatar_url,
        days: [],
      };
      userMap.set(row.user_id, entry);
    }
    if (row.day !== null) {
      entry.days.push(row.day);
    }
  }

  const todayUtc = new Date().toISOString().slice(0, 10);

  const streakRows = Array.from(userMap.values()).map((u) => {
    const { currentStreak, longestStreak } = computeStreaks(u.days, todayUtc);
    return {
      userId: u.userId,
      handle: u.handle,
      avatarUrl: u.avatarUrl,
      currentStreak,
      longestStreak,
    };
  });

  // Sort by currentStreak DESC, then longestStreak DESC
  streakRows.sort((a, b) => b.currentStreak - a.currentStreak || b.longestStreak - a.longestStreak);

  return c.json({ streaks: streakRows });
});

export default streaks;
