import { GetLeaderboardQuery } from "@token-rats/contracts";
import type { FriendRow, FriendSharedRoom, LeaderboardRange } from "@token-rats/contracts";
/**
 * v1.2 Track AD — `GET /v1/me/friends?range=today|7d|30d|all`
 *
 * "Friends" are derived, not stored: anyone the caller shares at least one
 * non-public room with. The response is sorted by spend (cost_usd_cents) over
 * the requested window, descending.
 *
 * Cached in KV under `fr:<userId>:<range>` with a 5 min TTL — busted in
 * `lib/ingest.ts` on session insert so a newly burned friend climbs the
 * list within a tick instead of waiting for the TTL.
 */
import { Hono } from "hono";
import type { Env } from "../env.js";
import { validationError } from "../lib/errors.js";
import type { AuthVariables } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";

type HonoEnv = { Bindings: Env; Variables: AuthVariables };

const friends = new Hono<HonoEnv>();

/** SQL date-filter clause + bind params for a given range. Mirrors leaderboard.ts. */
function dateFilter(
  range: LeaderboardRange,
  todayUtc: string,
): { clause: string; params: string[] } {
  if (range === "today") {
    return { clause: "AND dr.day = ?", params: [todayUtc] };
  }
  if (range === "7d") {
    return { clause: "AND dr.day >= ?", params: [offsetDay(todayUtc, -6)] };
  }
  if (range === "30d") {
    return { clause: "AND dr.day >= ?", params: [offsetDay(todayUtc, -29)] };
  }
  return { clause: "", params: [] };
}

function offsetDay(yyyy_mm_dd: string, days: number): string {
  const d = new Date(`${yyyy_mm_dd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

friends.get("/friends", requireAuth, async (c) => {
  const userId = c.var.userId;

  // Validate query (?range=…)
  let query: { range: LeaderboardRange };
  try {
    const raw = Object.fromEntries(new URL(c.req.url).searchParams.entries());
    query = GetLeaderboardQuery.parse(raw);
  } catch (e) {
    return validationError(c, e instanceof Error ? e.message : e);
  }

  const { range } = query;

  // KV cache hit
  const cacheKey = `fr:${userId}:${range}`;
  const cached = await c.env.CACHE.get(cacheKey);
  if (cached) {
    return c.json(JSON.parse(cached));
  }

  const todayUtc = new Date().toISOString().slice(0, 10);
  const { clause, params } = dateFilter(range, todayUtc);

  // One query: range-windowed stats per friend.
  //
  // The "friend" set is every distinct user_id that shares at least one
  // private (`is_public = 0` — treated as 0 when NULL) room with the caller,
  // excluding the caller themselves.
  //
  // NOTE: `users.twitter_handle` is only surfaced when `twitter_verified_at`
  // is set, so the UI never shows an unverified self-claimed handle.
  const sql = `
    SELECT
      u.id                                AS user_id,
      u.handle                            AS handle,
      u.avatar_url                        AS avatar_url,
      u.public_profile                    AS public_profile,
      CASE WHEN u.twitter_verified_at IS NOT NULL THEN u.twitter_handle ELSE NULL END
                                          AS twitter_handle,
      COALESCE(SUM(dr.tokens), 0)         AS tokens,
      COALESCE(SUM(dr.cost_usd_cents), 0) AS cost_usd_cents,
      COALESCE(SUM(dr.sessions), 0)       AS sessions
    FROM users u
    JOIN (
      SELECT DISTINCT rm_friend.user_id AS user_id
      FROM room_members rm_friend
      WHERE rm_friend.room_id IN (
        SELECT r.id
        FROM room_members rm_self
        JOIN rooms r ON r.id = rm_self.room_id
        WHERE rm_self.user_id = ?
          AND COALESCE(r.is_public, 0) = 0
      )
        AND rm_friend.user_id != ?
    ) friend_ids ON friend_ids.user_id = u.id
    LEFT JOIN daily_rollup dr
      ON dr.user_id = u.id
      ${clause}
    GROUP BY u.id
    ORDER BY cost_usd_cents DESC, tokens DESC, u.handle ASC
  `;

  const statsResult = await c.env.DB.prepare(sql)
    .bind(userId, userId, ...params)
    .all<{
      user_id: string;
      handle: string;
      avatar_url: string | null;
      public_profile: number;
      twitter_handle: string | null;
      tokens: number;
      cost_usd_cents: number;
      sessions: number;
    }>();

  const friendIds = (statsResult.results ?? []).map((r) => r.user_id);

  // Second pass — gather the shared private rooms per friend so the UI can
  // render "in #devclub, #sf-team" chips. Done as a separate query (rather
  // than a SQL GROUP_CONCAT) so we can pass through both `code` and `name`
  // cleanly with no escape ambiguity.
  const sharedByFriend = new Map<string, FriendSharedRoom[]>();
  if (friendIds.length > 0) {
    const placeholders = friendIds.map(() => "?").join(", ");
    const sharedRoomsSql = `
      SELECT
        rm_friend.user_id AS friend_id,
        r.code            AS code,
        r.name            AS name
      FROM rooms r
      JOIN room_members rm_self   ON rm_self.room_id   = r.id AND rm_self.user_id   = ?
      JOIN room_members rm_friend ON rm_friend.room_id = r.id AND rm_friend.user_id IN (${placeholders})
      WHERE COALESCE(r.is_public, 0) = 0
      ORDER BY r.name ASC
    `;
    const sharedResult = await c.env.DB.prepare(sharedRoomsSql)
      .bind(userId, ...friendIds)
      .all<{ friend_id: string; code: string; name: string }>();

    for (const row of sharedResult.results ?? []) {
      const list = sharedByFriend.get(row.friend_id) ?? [];
      list.push({ code: row.code, name: row.name });
      sharedByFriend.set(row.friend_id, list);
    }
  }

  const friendRows: FriendRow[] = (statsResult.results ?? []).map((r) => ({
    userId: r.user_id,
    handle: r.handle,
    avatarUrl: r.avatar_url,
    twitterHandle: r.twitter_handle ?? null,
    publicProfile: r.public_profile === 1,
    sharedRooms: sharedByFriend.get(r.user_id) ?? [],
    tokens: r.tokens,
    costUsdCents: r.cost_usd_cents,
    sessions: r.sessions,
  }));

  const response = {
    range,
    friends: friendRows,
  };

  // 5 min TTL, matching leaderboard. Friends boards are best-effort fresh —
  // no SSE invalidation here, but a 60s floor was generating ~1,440 KV
  // writes/day per active user with no real UX upside.
  await c.env.CACHE.put(cacheKey, JSON.stringify(response), {
    expirationTtl: 300,
  });

  return c.json(response);
});

export default friends;
