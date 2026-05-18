/**
 * GET /v1/u/:handle — public profile (auth optional).
 *
 * Returns user info + today/week/allTime token + cost totals
 * aggregated from daily_rollup.
 */
import { Hono } from "hono";
import type { Env } from "../env.js";
import type { AuthVariables } from "../middleware/auth.js";
import { optionalAuth } from "../middleware/auth.js";
import { notFound } from "../lib/errors.js";

type HonoEnv = { Bindings: Env; Variables: Partial<AuthVariables> };

const profiles = new Hono<HonoEnv>();

profiles.get("/:handle", optionalAuth, async (c) => {
  const handle = c.req.param("handle");

  const user = await c.env.DB.prepare(
    "SELECT id, handle, avatar_url FROM users WHERE handle = ?",
  )
    .bind(handle)
    .first<{ id: string; handle: string; avatar_url: string | null }>();

  if (!user) {
    return notFound(c, "User not found");
  }

  const todayUtc = new Date().toISOString().slice(0, 10);

  // Compute today, last 7 days (week), and all-time in one query using CASE
  const row = await c.env.DB.prepare(
    `SELECT
       COALESCE(SUM(CASE WHEN day = ?  THEN tokens         ELSE 0 END), 0) AS today_tokens,
       COALESCE(SUM(CASE WHEN day = ?  THEN cost_usd_cents ELSE 0 END), 0) AS today_cost,
       COALESCE(SUM(CASE WHEN day >= ? THEN tokens         ELSE 0 END), 0) AS week_tokens,
       COALESCE(SUM(CASE WHEN day >= ? THEN cost_usd_cents ELSE 0 END), 0) AS week_cost,
       COALESCE(SUM(tokens),         0) AS all_tokens,
       COALESCE(SUM(cost_usd_cents), 0) AS all_cost
     FROM daily_rollup
     WHERE user_id = ?`,
  )
    .bind(
      todayUtc,   // today_tokens
      todayUtc,   // today_cost
      weekStart(todayUtc),  // week_tokens
      weekStart(todayUtc),  // week_cost
      user.id,
    )
    .first<{
      today_tokens: number;
      today_cost: number;
      week_tokens: number;
      week_cost: number;
      all_tokens: number;
      all_cost: number;
    }>();

  const totals = row ?? {
    today_tokens: 0,
    today_cost: 0,
    week_tokens: 0,
    week_cost: 0,
    all_tokens: 0,
    all_cost: 0,
  };

  return c.json({
    profile: {
      id: user.id,
      handle: user.handle,
      avatarUrl: user.avatar_url,
      totals: {
        today: {
          tokens: totals.today_tokens,
          costUsdCents: totals.today_cost,
        },
        week: {
          tokens: totals.week_tokens,
          costUsdCents: totals.week_cost,
        },
        allTime: {
          tokens: totals.all_tokens,
          costUsdCents: totals.all_cost,
        },
      },
    },
  });
});

/** Return the Monday of the ISO week containing `yyyy_mm_dd`. */
function weekStart(yyyy_mm_dd: string): string {
  const d = new Date(`${yyyy_mm_dd}T00:00:00Z`);
  // getUTCDay(): 0=Sun, 1=Mon, ..., 6=Sat
  const day = d.getUTCDay();
  // days since Monday (handle Sunday wrapping)
  const offset = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

export default profiles;
