import type { ListPublicGroupsResponse, PublicGroup } from "@token-rats/contracts";
/**
 * v1.2 Track AE — public country-locked groups.
 *
 *   GET /v1/groups  — list public rooms whose `country` matches the viewer's
 *                     Cloudflare-resolved `cf-ipcountry`. Anonymous browsing
 *                     is allowed (optionalAuth). If we can't resolve a
 *                     country, return `{ viewerCountry: null, groups: [] }`
 *                     so the page renders an honest empty state.
 *
 *   Sorted by member count DESC, capped at 50. KV-cached per-country for 60s
 *   under `pg:{COUNTRY}`. The cache is busted by routes/rooms.ts whenever a
 *   public room is created, joined, renamed, or has `is_public` flipped.
 */
import { Hono } from "hono";
import type { Env } from "../env.js";
import { getViewerCountry } from "../lib/country.js";
import type { AuthVariables } from "../middleware/auth.js";
import { optionalAuth } from "../middleware/auth.js";

type HonoEnv = { Bindings: Env; Variables: AuthVariables };

const groups = new Hono<HonoEnv>();

const MAX_GROUPS = 50;
const CACHE_TTL_SECONDS = 60;

/** KV key for a country's `/groups` listing. Always uppercase. */
export function publicGroupsCacheKey(country: string): string {
  return `pg:${country.toUpperCase()}`;
}

/* -------------------------------------------------------------------------- */
/* GET /v1/groups                                                              */
/* -------------------------------------------------------------------------- */

groups.get("/", optionalAuth, async (c) => {
  const viewerCountry = getViewerCountry(c);

  if (!viewerCountry) {
    // No `cf-ipcountry` (corporate VPN, local dev without the header, etc.).
    // Render the page with an honest empty state — don't 4xx.
    const empty: ListPublicGroupsResponse = { viewerCountry: null, groups: [] };
    return c.json(empty);
  }

  const cacheKey = publicGroupsCacheKey(viewerCountry);
  const cached = await c.env.CACHE.get(cacheKey);
  if (cached) {
    const parsed = JSON.parse(cached) as PublicGroup[];
    const response: ListPublicGroupsResponse = {
      viewerCountry,
      groups: parsed,
    };
    return c.json(response);
  }

  // SQLite stores boolean as 0/1; country is uppercase in the DB.
  // We compare case-insensitively to be defensive about older rows.
  const result = await c.env.DB.prepare(
    `SELECT r.code         AS code,
            r.name         AS name,
            r.country      AS country,
            r.created_at   AS created_at,
            COUNT(rm.user_id) AS member_count
       FROM rooms r
       LEFT JOIN room_members rm ON rm.room_id = r.id
      WHERE r.is_public = 1
        AND UPPER(r.country) = ?
      GROUP BY r.id
      ORDER BY member_count DESC, r.created_at DESC
      LIMIT ?`,
  )
    .bind(viewerCountry, MAX_GROUPS)
    .all<{
      code: string;
      name: string;
      country: string;
      created_at: number;
      member_count: number;
    }>();

  const rows: PublicGroup[] = (result.results ?? []).map((r) => ({
    code: r.code,
    name: r.name,
    country: r.country.toUpperCase(),
    memberCount: r.member_count,
    createdAt: r.created_at,
  }));

  await c.env.CACHE.put(cacheKey, JSON.stringify(rows), {
    expirationTtl: CACHE_TTL_SECONDS,
  });

  const response: ListPublicGroupsResponse = {
    viewerCountry,
    groups: rows,
  };
  return c.json(response);
});

export default groups;
