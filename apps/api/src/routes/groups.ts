/**
 * GET /v1/groups — public country-locked rooms in the viewer's country.
 *
 * Auth optional. Returns up to 50 rooms where `is_public=1` and
 * `country = cf-ipcountry`. Each row includes member count + 30d token / cost
 * totals. Sorted by 30d cost (USD) descending — the "most-active rooms in
 * your country" surface.
 *
 * Empty / unknown `cf-ipcountry` → empty list with `country: null`.
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
    return c.json({ country: null, groups: [] });
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
  });
});

export default groups;
