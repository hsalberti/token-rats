/**
 * GET /v1/u/:handle — public profile (auth optional).
 * GET /v1/u/:handle/autobiography — richer stats for the onboarding flow.
 *
 * Returns user info + today/week/allTime token + cost totals
 * aggregated from daily_rollup.
 */
import { Hono } from "hono";
import type { Env } from "../env.js";
import { notFound } from "../lib/errors.js";
import { ensureReferralCode } from "../lib/referral.js";
import type { AuthVariables } from "../middleware/auth.js";
import { optionalAuth } from "../middleware/auth.js";

type HonoEnv = { Bindings: Env; Variables: AuthVariables };

const profiles = new Hono<HonoEnv>();

profiles.get("/:handle", optionalAuth, async (c) => {
  const handle = c.req.param("handle");

  const user = await c.env.DB.prepare(
    "SELECT id, handle, avatar_url, public_profile, bio, twitter_handle FROM users WHERE handle = ?",
  )
    .bind(handle)
    .first<{
      id: string;
      handle: string;
      avatar_url: string | null;
      public_profile: number;
      bio: string | null;
      twitter_handle: string | null;
    }>();

  if (!user) {
    return notFound(c, "User not found");
  }

  // Check banlist — drop public-facing views for banned handles
  const banned = await c.env.CACHE.get(`banned:handle:${handle.toLowerCase()}`);
  if (banned !== null) {
    return notFound(c, "User not found");
  }

  // Private-profile guard: only the user themselves may view
  const callerId = c.var.userId ?? null;
  if (user.public_profile !== 1 && callerId !== user.id) {
    return notFound(c, "This profile is private");
  }

  // Determine if caller is the owner (so we can include sensitive fields)
  const isOwner = callerId === user.id;
  const isPublic = user.public_profile === 1;

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
      todayUtc, // today_tokens
      todayUtc, // today_cost
      weekStart(todayUtc), // week_tokens
      weekStart(todayUtc), // week_cost
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

  // Per-source all-time breakdown for the profile tile grid. Reads `sessions`
  // (not daily_rollup, which has no source column). Keep ORDER BY tokens DESC
  // so the UI can show the dominant source first.
  const sourcesRows = await c.env.DB.prepare(
    `SELECT source,
            COALESCE(SUM(in_tokens + out_tokens), 0) AS tokens,
            COALESCE(SUM(cost_usd_cents), 0)         AS cost,
            COUNT(*)                                  AS sessions
       FROM sessions
      WHERE user_id = ?
      GROUP BY source
      ORDER BY tokens DESC`,
  )
    .bind(user.id)
    .all<{ source: string; tokens: number; cost: number; sessions: number }>();

  const sources = (sourcesRows.results ?? []).map((r) => ({
    source: r.source,
    tokens: r.tokens,
    costUsdCents: r.cost,
    sessions: r.sessions,
  }));

  // Referrals (migration 0007). Count is public — readable by anyone who
  // can already see the profile. The code itself is owner-only so the page
  // can render a copy-able invite link without a second fetch.
  const referralCountRow = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM referrals WHERE referrer_user_id = ?",
  )
    .bind(user.id)
    .first<{ n: number }>();
  const referredCount = referralCountRow?.n ?? 0;

  const referralCode = isOwner ? await ensureReferralCode(c.env.DB, user.id) : undefined;

  return c.json({
    profile: {
      id: user.id,
      handle: user.handle,
      avatarUrl: user.avatar_url,
      ...(isPublic || isOwner ? { bio: user.bio, twitterHandle: user.twitter_handle } : {}),
      ...(isOwner ? { publicProfile: user.public_profile === 1 } : {}),
      referredCount,
      ...(referralCode ? { referralCode } : {}),
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
      sources,
    },
  });
});

/**
 * GET /v1/u/:handle/autobiography
 *
 * Returns rich aggregated stats derived from `sessions` and `daily_rollup`
 * to power the onboarding "Token Autobiography" moment.
 * No new tables needed — everything is computed from existing data.
 */
profiles.get("/:handle/autobiography", optionalAuth, async (c) => {
  const handle = c.req.param("handle");

  const user = await c.env.DB.prepare(
    "SELECT id, handle, avatar_url, public_profile FROM users WHERE handle = ?",
  )
    .bind(handle)
    .first<{ id: string; handle: string; avatar_url: string | null; public_profile: number }>();

  if (!user) {
    return notFound(c, "User not found");
  }

  const callerId = c.var.userId ?? null;
  if (user.public_profile !== 1 && callerId !== user.id) {
    return notFound(c, "This profile is private");
  }

  const todayUtc = new Date().toISOString().slice(0, 10);
  const monthStart = `${todayUtc.slice(0, 7)}-01`; // first of current month

  // --- All-time totals + month totals from daily_rollup ---
  const rollupRow = await c.env.DB.prepare(
    `SELECT
       COALESCE(SUM(tokens), 0)                                              AS all_tokens,
       COALESCE(SUM(cost_usd_cents), 0)                                      AS all_cost,
       COALESCE(SUM(CASE WHEN day >= ? THEN tokens         ELSE 0 END), 0)   AS month_tokens,
       COALESCE(SUM(CASE WHEN day >= ? THEN cost_usd_cents ELSE 0 END), 0)   AS month_cost,
       COALESCE(SUM(sessions), 0)                                            AS all_sessions,
       COUNT(DISTINCT day)                                                   AS active_days,
       MIN(day)                                                              AS first_day
     FROM daily_rollup
     WHERE user_id = ?`,
  )
    .bind(monthStart, monthStart, user.id)
    .first<{
      all_tokens: number;
      all_cost: number;
      month_tokens: number;
      month_cost: number;
      all_sessions: number;
      active_days: number;
      first_day: string | null;
    }>();

  // --- Biggest single session (sum in_tokens + out_tokens) from sessions ---
  const biggestRow = await c.env.DB.prepare(
    `SELECT COALESCE(MAX(in_tokens + out_tokens), 0) AS biggest
     FROM sessions
     WHERE user_id = ?`,
  )
    .bind(user.id)
    .first<{ biggest: number }>();

  // --- Dominant model (most total tokens across all sessions) ---
  const dominantRow = await c.env.DB.prepare(
    `SELECT model, SUM(in_tokens + out_tokens) AS tok
     FROM sessions
     WHERE user_id = ?
     GROUP BY model
     ORDER BY tok DESC
     LIMIT 1`,
  )
    .bind(user.id)
    .first<{ model: string; tok: number }>();

  // --- Most active day-of-week (0=Sun … 6=Sat) from daily_rollup ---
  // SQLite strftime('%w', day) returns 0=Sunday … 6=Saturday
  const dowRow = await c.env.DB.prepare(
    `SELECT CAST(strftime('%w', day) AS INTEGER) AS dow, SUM(tokens) AS tok
     FROM daily_rollup
     WHERE user_id = ?
     GROUP BY dow
     ORDER BY tok DESC
     LIMIT 1`,
  )
    .bind(user.id)
    .first<{ dow: number; tok: number }>();

  const allTokens = rollupRow?.all_tokens ?? 0;
  const allCost = rollupRow?.all_cost ?? 0;
  const monthTokens = rollupRow?.month_tokens ?? 0;
  const monthCost = rollupRow?.month_cost ?? 0;
  const allSessions = rollupRow?.all_sessions ?? 0;
  const activeDays = rollupRow?.active_days ?? 0;
  const firstDay = rollupRow?.first_day ?? null;

  const biggestSessionTokens = biggestRow?.biggest ?? 0;
  const dominantModel = dominantRow?.model ?? "unknown";
  const mostActiveDayOfWeek = dowRow?.dow ?? 0;

  // sessions per day = total sessions / days that had ≥1 session
  const sessionsPerDay = activeDays > 0 ? allSessions / activeDays : 0;

  // coffees this month: $5/cup, cost is in cents
  const monthlyCoffees = monthCost / (5 * 100);

  return c.json({
    autobiography: {
      handle: user.handle,
      avatarUrl: user.avatar_url,
      totalTokens: allTokens,
      totalCostUsdCents: allCost,
      monthTokens,
      monthCostUsdCents: monthCost,
      biggestSessionTokens,
      dominantModel,
      mostActiveDayOfWeek,
      sessionsPerDay: Math.round(sessionsPerDay * 10) / 10,
      totalSessions: allSessions,
      firstSyncDate: firstDay,
      monthlyCoffees: Math.round(monthlyCoffees * 10) / 10,
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

/* -------------------------------------------------------------------------- */
/* GET /v1/u/:handle/heatmap?range=30d|52w                                    */
/* -------------------------------------------------------------------------- */
/* Returns the requested range of `(day, tokens, sessions)` for the calendar  */
/* heatmap. 30d (default) = trailing 30 days; 52w = trailing 364 days. Same   */
/* visibility gates as the main profile. Missing days are omitted; the client */
/* fills zeros.                                                               */
/* -------------------------------------------------------------------------- */

profiles.get("/:handle/heatmap", optionalAuth, async (c) => {
  const handle = c.req.param("handle");

  const user = await c.env.DB.prepare("SELECT id, public_profile FROM users WHERE handle = ?")
    .bind(handle)
    .first<{ id: string; public_profile: number }>();

  if (!user) return notFound(c, "User not found");

  const banned = await c.env.CACHE.get(`banned:handle:${handle.toLowerCase()}`);
  if (banned !== null) return notFound(c, "User not found");

  const callerId = c.var.userId ?? null;
  if (user.public_profile !== 1 && callerId !== user.id) {
    return notFound(c, "This profile is private");
  }

  const rangeParam = new URL(c.req.url).searchParams.get("range") ?? "30d";
  const range: "30d" | "52w" = rangeParam === "52w" ? "52w" : "30d";
  // 30d → 29 days back so today + 29 = 30 cells; 52w → 363 days back so 52×7.
  const daysBack = range === "52w" ? 363 : 29;

  const today = new Date();
  const from = new Date(today);
  from.setUTCDate(from.getUTCDate() - daysBack);
  const fromDay = from.toISOString().slice(0, 10);

  const result = await c.env.DB.prepare(
    `SELECT day,
            SUM(tokens)   AS tokens,
            SUM(sessions) AS sessions
       FROM daily_rollup
      WHERE user_id = ? AND day >= ?
      GROUP BY day
      ORDER BY day`,
  )
    .bind(user.id, fromDay)
    .all<{ day: string; tokens: number; sessions: number }>();

  const days = (result.results ?? []).map((r) => ({
    day: r.day,
    tokens: r.tokens,
    sessions: r.sessions,
  }));

  return c.json({
    heatmap: {
      range,
      from: fromDay,
      to: today.toISOString().slice(0, 10),
      days,
    },
  });
});

export default profiles;
