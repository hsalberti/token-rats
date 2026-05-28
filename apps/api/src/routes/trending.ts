/**
 * GET /v1/trending?range=today|7d|30d
 *
 * Global leaderboard of public users only, aggregated from daily_rollup.
 * Results are cached in KV under `trending:<range>` with a 5-minute TTL.
 * Banned handles are excluded.
 */

import { GetTrendingQuery } from "@token-rats/contracts";
import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../env.js";
import { validationError } from "../lib/errors.js";
import type { AuthVariables } from "../middleware/auth.js";

type HonoEnv = { Bindings: Env; Variables: AuthVariables };

const trending = new Hono<HonoEnv>();

const KV_TTL_SECONDS = 300; // 5 minutes

trending.get("/", async (c) => {
  const queryRaw = c.req.query();
  const queryParsed = GetTrendingQuery.safeParse(queryRaw);
  if (!queryParsed.success) {
    return validationError(c, queryParsed.error.issues);
  }
  const { range } = queryParsed.data;

  // 1. Try KV cache
  const cacheKey = `trending:${range}`;
  const cached = await c.env.CACHE.get(cacheKey, "text");
  if (cached) {
    return c.json(JSON.parse(cached));
  }

  // 2. Compute date boundary
  const todayUtc = new Date().toISOString().slice(0, 10);
  let since: string;
  if (range === "today") {
    since = todayUtc;
  } else if (range === "7d") {
    const d = new Date(`${todayUtc}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 6); // today + 6 previous days = 7 days
    since = d.toISOString().slice(0, 10);
  } else if (range === "30d") {
    const d = new Date(`${todayUtc}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 29);
    since = d.toISOString().slice(0, 10);
  } else {
    // "all" — no date filter
    since = "0000-01-01";
  }

  // 3. Query: public users only, top 100, ordered by tokens desc
  const result = await c.env.DB.prepare(
    `SELECT
       u.id         AS user_id,
       u.handle,
       u.avatar_url,
       u.country,
       COALESCE(SUM(dr.tokens),         0) AS tokens,
       COALESCE(SUM(dr.cost_usd_cents), 0) AS cost_usd_cents,
       COALESCE(SUM(dr.sessions),       0) AS sessions
     FROM users u
     LEFT JOIN daily_rollup dr
       ON dr.user_id = u.id
       AND dr.day >= ?
     WHERE u.public_profile = 1
     GROUP BY u.id, u.handle, u.avatar_url, u.country
     ORDER BY tokens DESC
     LIMIT 100`,
  )
    .bind(since)
    .all<{
      user_id: string;
      handle: string;
      avatar_url: string | null;
      country: string | null;
      tokens: number;
      cost_usd_cents: number;
      sessions: number;
    }>();

  const rows = result.results ?? [];

  // 4. Filter banned handles
  const filtered: typeof rows = [];
  for (const row of rows) {
    const banKey = `banned:handle:${row.handle.toLowerCase()}`;
    const isBanned = await c.env.CACHE.get(banKey);
    if (isBanned === null) {
      filtered.push(row);
    }
  }

  const generatedAt = Date.now();

  const payload = {
    rows: filtered.map((row, i) => ({
      rank: i + 1,
      userId: row.user_id,
      handle: row.handle,
      avatarUrl: row.avatar_url,
      country: row.country,
      tokens: row.tokens,
      costUsdCents: row.cost_usd_cents,
      sessions: row.sessions,
      // Contract requires `topSources` (Zod default is server-side only — the
      // web client doesn't re-parse, so omitting this crashes consumers like
      // GlobalBoardPreview that pass the field straight into <SourceBadges>).
      topSources: [],
    })),
    range,
    generatedAt,
  };

  // 5. Write to KV cache
  await c.env.CACHE.put(cacheKey, JSON.stringify(payload), {
    expirationTtl: KV_TTL_SECONDS,
  });

  return c.json(payload);
});

export default trending;
