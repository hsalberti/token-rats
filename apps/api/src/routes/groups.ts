/**
 * GET /v1/groups — country-scoped public surface for the viewer's country.
 *
 * Auth optional. Returns two parallel boards keyed off `cf-ipcountry`:
 *  - `groups`: up to 50 public rooms where `is_public=1` and
 *    `country = cf-ipcountry`, ranked by trailing-30d cost.
 *  - `userBoard`: up to 100 public users where `users.country = cf-ipcountry`,
 *    ranked by trailing-30d tokens. Drives the "Brazil board" auto-list — no
 *    room creation required.
 *
 * Empty / unknown `cf-ipcountry` → both lists empty with `country: null`.
 * Banned handles are filtered out of `userBoard` (KV-backed list).
 */
import { Hono } from "hono";
import type { Env } from "../env.js";
import type { AuthVariables } from "../middleware/auth.js";
import { optionalAuth } from "../middleware/auth.js";

type HonoEnv = { Bindings: Env; Variables: AuthVariables };

const groups = new Hono<HonoEnv>();

function cfCountry(c: { req: { header: (k: string) => string | undefined } }): string | null {
  const raw = c.req.header("cf-ipcountry");
  if (!raw) return null;
  const trimmed = raw.trim().toUpperCase();
  if (trimmed.length !== 2) return null;
  if (trimmed === "XX" || trimmed === "T1") return null;
  return trimmed;
}

groups.get("/", optionalAuth, async (c) => {
  const country = cfCountry(c);
  if (!country) {
    return c.json({ country: null, groups: [], userBoard: [] });
  }

  // 30-day window for aggregate totals.
  const today = new Date();
  const from = new Date(today);
  from.setUTCDate(from.getUTCDate() - 29);
  const fromDay = from.toISOString().slice(0, 10);

  // Pull all public rooms in this country, plus per-room aggregates.
  // Two LEFT JOINs (member count, dr totals) so rooms with no members or
  // no rollup rows still appear with zeros.
  const result = await c.env.DB.prepare(
    `SELECT r.code, r.name, r.country,
            COALESCE(mc.n, 0)               AS member_count,
            COALESCE(t.tokens, 0)           AS total_tokens,
            COALESCE(t.cost_usd_cents, 0)   AS total_cost
       FROM rooms r
       LEFT JOIN (
         SELECT room_id, COUNT(*) AS n
           FROM room_members
          GROUP BY room_id
       ) mc ON mc.room_id = r.id
       LEFT JOIN (
         SELECT rm.room_id,
                SUM(dr.tokens)         AS tokens,
                SUM(dr.cost_usd_cents) AS cost_usd_cents
           FROM daily_rollup dr
           JOIN room_members rm ON rm.user_id = dr.user_id
          WHERE dr.day >= ?
          GROUP BY rm.room_id
       ) t ON t.room_id = r.id
      WHERE r.is_public = 1
        AND r.country = ?
      ORDER BY total_cost DESC
      LIMIT 50`,
  )
    .bind(fromDay, country)
    .all<{
      code: string;
      name: string;
      country: string;
      member_count: number;
      total_tokens: number;
      total_cost: number;
    }>();

  // Country user board — public users in this country, ranked by trailing-30d
  // tokens. LEFT JOIN so a brand-new public user with no rollup rows still
  // appears (zeros), making the board feel populated from day one.
  const usersRes = await c.env.DB.prepare(
    `SELECT u.id                              AS user_id,
            u.handle,
            u.avatar_url,
            COALESCE(SUM(dr.tokens),         0) AS tokens,
            COALESCE(SUM(dr.cost_usd_cents), 0) AS cost_usd_cents,
            COALESCE(SUM(dr.sessions),       0) AS sessions
       FROM users u
       LEFT JOIN daily_rollup dr
         ON dr.user_id = u.id
        AND dr.day >= ?
      WHERE u.public_profile = 1
        AND u.country = ?
      GROUP BY u.id, u.handle, u.avatar_url
      ORDER BY tokens DESC, u.handle ASC
      LIMIT 100`,
  )
    .bind(fromDay, country)
    .all<{
      user_id: string;
      handle: string;
      avatar_url: string | null;
      tokens: number;
      cost_usd_cents: number;
      sessions: number;
    }>();

  // Drop banned handles (KV-backed banlist matches `/v1/trending`).
  const userRows = usersRes.results ?? [];
  const filteredUsers: typeof userRows = [];
  for (const row of userRows) {
    const banned = await c.env.CACHE.get(`banned:handle:${row.handle.toLowerCase()}`);
    if (banned === null) filteredUsers.push(row);
  }

  return c.json({
    country,
    groups: (result.results ?? []).map((r) => ({
      code: r.code,
      name: r.name,
      country: r.country,
      memberCount: r.member_count,
      total30dTokens: r.total_tokens,
      total30dCostUsdCents: r.total_cost,
    })),
    userBoard: filteredUsers.map((row, i) => ({
      rank: i + 1,
      userId: row.user_id,
      handle: row.handle,
      avatarUrl: row.avatar_url,
      tokens: row.tokens,
      costUsdCents: row.cost_usd_cents,
      sessions: row.sessions,
    })),
  });
});

export default groups;
