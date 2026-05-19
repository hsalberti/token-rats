/**
 * GET /v1/rooms/:code/group-streak
 *
 * v1.2 Track Y — room-level streak. Member-gated (404 to non-members).
 *
 * Reuses `computeStreaks()` from `streaks.ts`:
 *  - **active**    = union of all members' active days (≥1 member burned that day).
 *  - **unanimous** = intersection of every current member's days, where "every
 *    member" excludes anyone who joined more recently than the day in question.
 *
 * Cached in KV under `gs:{code}` with a 60s TTL.
 */
import { Hono } from "hono";
import type { GroupStreak } from "@token-rats/contracts";
import type { Env } from "../env.js";
import type { AuthVariables } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";
import { notFound } from "../lib/errors.js";
import { computeStreaks } from "./streaks.js";

type HonoEnv = { Bindings: Env; Variables: AuthVariables };

const groupStreak = new Hono<HonoEnv>();

/**
 * Convert a unix-ms `joined_at` to the UTC day on which the user joined.
 * Used to gate the unanimous-streak window: days before this don't count
 * against the user.
 */
function tsToUtcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

groupStreak.get("/:code/group-streak", requireAuth, async (c) => {
  const userId = c.var.userId;
  const code = c.req.param("code");

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

  const cacheKey = `gs:${room.code}`;
  const cached = await c.env.CACHE.get(cacheKey);
  if (cached) return c.json(JSON.parse(cached));

  // 1. Fetch every (user_id, joined_at) pair for the room.
  const memberRows = await c.env.DB.prepare(
    `SELECT user_id, joined_at FROM room_members WHERE room_id = ?`,
  )
    .bind(room.id)
    .all<{ user_id: string; joined_at: number }>();

  const members = (memberRows.results ?? []).map((r) => ({
    userId: r.user_id,
    joinedDay: tsToUtcDay(r.joined_at),
  }));

  // 2. Fetch every (user_id, day) pair for room members.
  const dayRows = await c.env.DB.prepare(
    `SELECT rm.user_id, dr.day
       FROM room_members rm
       JOIN daily_rollup dr ON dr.user_id = rm.user_id
      WHERE rm.room_id = ?
        AND dr.sessions > 0
      ORDER BY dr.day ASC`,
  )
    .bind(room.id)
    .all<{ user_id: string; day: string }>();

  const todayUtc = new Date().toISOString().slice(0, 10);

  // 3. Active streak = union over all members.
  const unionSet = new Set<string>();
  const perMember = new Map<string, Set<string>>();
  for (const r of dayRows.results ?? []) {
    unionSet.add(r.day);
    if (!perMember.has(r.user_id)) perMember.set(r.user_id, new Set());
    perMember.get(r.user_id)!.add(r.day);
  }
  const activeDays = Array.from(unionSet).sort();
  const active = computeStreaks(activeDays, todayUtc);

  // 4. Unanimous streak = intersection across every member, ignoring days
  //    before each member's joinedDay (so a recent joiner can't retroactively
  //    break the streak for days they weren't around for).
  //
  //    For each candidate day d, "unanimous" holds iff every member who joined
  //    on/before d has a row for d. Compute by iterating the union of days and
  //    keeping only those that pass.
  const unanimousDays: string[] = [];
  for (const d of activeDays) {
    let ok = true;
    for (const m of members) {
      if (m.joinedDay > d) continue; // member wasn't here yet — excused
      const ms = perMember.get(m.userId);
      if (!ms || !ms.has(d)) {
        ok = false;
        break;
      }
    }
    if (ok) unanimousDays.push(d);
  }
  const unanimous = computeStreaks(unanimousDays, todayUtc);

  const streak: GroupStreak = {
    activeStreakDays: active.currentStreak,
    longestStreakDays: active.longestStreak,
    unanimousActiveStreakDays: unanimous.currentStreak,
    unanimousLongestStreakDays: unanimous.longestStreak,
  };

  const response = { streak };
  await c.env.CACHE.put(cacheKey, JSON.stringify(response), { expirationTtl: 60 });
  return c.json(response);
});

export default groupStreak;
