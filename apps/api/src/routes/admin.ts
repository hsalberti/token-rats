import type {
  AdminActivityResponse,
  AdminReferrersResponse,
  AdminSignupsResponse,
} from "@token-rats/contracts";
/**
 * GET /v1/admin/signups    — total user count + cumulative signups by UTC day (30d)
 * GET /v1/admin/activity   — distinct active users per UTC day (30d)
 * GET /v1/admin/referrers  — signup-source signal (or "not tracked" placeholder)
 *
 * Auth: cookie/bearer required (requireAuth), AND the resolved userId must
 * match `ADMIN_GITHUB_LOGIN` via the `isAdmin` helper. Non-admins get 403.
 *
 * This is launch-day read-only tooling: no writes, no caching, all queries
 * are bounded to the last 30 UTC days.
 */
import { Hono } from "hono";
import type { Env } from "../env.js";
import { isAdmin } from "../lib/admin.js";
import { forbidden } from "../lib/errors.js";
import type { AuthVariables } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";

type HonoEnv = { Bindings: Env; Variables: AuthVariables };

const admin = new Hono<HonoEnv>();

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** YYYY-MM-DD for a Date in UTC. */
function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Returns an ordered list of 30 UTC day strings, oldest first, ending today. */
function last30Days(now: Date = new Date()): string[] {
  const today = new Date(`${utcDay(now)}T00:00:00Z`);
  const days: string[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    days.push(utcDay(d));
  }
  return days;
}

/** Epoch-ms for midnight UTC of the given YYYY-MM-DD. */
function dayStartMs(day: string): number {
  return Date.parse(`${day}T00:00:00Z`);
}

/* -------------------------------------------------------------------------- */
/* Admin gate (applied to every route below)                                   */
/* -------------------------------------------------------------------------- */

admin.use("*", requireAuth, async (c, next) => {
  const ok = await isAdmin(c.env, c.var.userId);
  if (!ok) return forbidden(c, "Admin access required");
  return next();
});

/* -------------------------------------------------------------------------- */
/* GET /v1/admin/signups                                                       */
/* -------------------------------------------------------------------------- */

admin.get("/signups", async (c) => {
  const days = last30Days();
  const firstDay = days[0];
  if (!firstDay) {
    // Defensive — last30Days always returns 30 entries. Satisfies TS.
    return c.json<AdminSignupsResponse>({
      totalUsers: 0,
      series: [],
      generatedAt: Date.now(),
    });
  }
  const windowStartMs = dayStartMs(firstDay);

  // Total users, all time.
  const totalRow = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM users").first<{ n: number }>();
  const totalUsers = totalRow?.n ?? 0;

  // Users created strictly before the 30-day window start.
  const baselineRow = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE created_at < ?")
    .bind(windowStartMs)
    .first<{ n: number }>();
  const baseline = baselineRow?.n ?? 0;

  // Per-day new user counts in the window. Group on strftime over UTC ms.
  // SQLite stores integers, so divide by 1000 to feed strftime as unix epoch.
  const perDay = await c.env.DB.prepare(
    `SELECT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch') AS day,
            COUNT(*) AS n
     FROM users
     WHERE created_at >= ?
     GROUP BY day`,
  )
    .bind(windowStartMs)
    .all<{ day: string; n: number }>();

  const newByDay = new Map<string, number>();
  for (const row of perDay.results ?? []) {
    newByDay.set(row.day, row.n);
  }

  let running = baseline;
  const series = days.map((day) => {
    const newUsers = newByDay.get(day) ?? 0;
    running += newUsers;
    return { day, newUsers, cumulative: running };
  });

  const payload: AdminSignupsResponse = {
    totalUsers,
    series,
    generatedAt: Date.now(),
  };
  return c.json(payload);
});

/* -------------------------------------------------------------------------- */
/* GET /v1/admin/activity                                                      */
/* -------------------------------------------------------------------------- */

admin.get("/activity", async (c) => {
  const days = last30Days();
  const firstDay = days[0];
  if (!firstDay) {
    return c.json<AdminActivityResponse>({
      series: [],
      activeUsers30d: 0,
      generatedAt: Date.now(),
    });
  }

  // daily_rollup.day is already YYYY-MM-DD UTC.
  // "Active" = at least one rollup row for that day, i.e. they synced ≥1
  // session on that day. (See contracts/admin.ts for rationale.)
  const perDay = await c.env.DB.prepare(
    `SELECT day, COUNT(DISTINCT user_id) AS n
     FROM daily_rollup
     WHERE day >= ?
     GROUP BY day`,
  )
    .bind(firstDay)
    .all<{ day: string; n: number }>();

  const byDay = new Map<string, number>();
  for (const row of perDay.results ?? []) {
    byDay.set(row.day, row.n);
  }

  const series = days.map((day) => ({
    day,
    activeUsers: byDay.get(day) ?? 0,
  }));

  // 30-day distinct active users (any day in the window).
  const totalRow = await c.env.DB.prepare(
    "SELECT COUNT(DISTINCT user_id) AS n FROM daily_rollup WHERE day >= ?",
  )
    .bind(firstDay)
    .first<{ n: number }>();
  const activeUsers30d = totalRow?.n ?? 0;

  const payload: AdminActivityResponse = {
    series,
    activeUsers30d,
    generatedAt: Date.now(),
  };
  return c.json(payload);
});

/* -------------------------------------------------------------------------- */
/* GET /v1/admin/referrers                                                     */
/* -------------------------------------------------------------------------- */

admin.get("/referrers", async (c) => {
  // Referral attribution is not in the schema. There is no `referrer`
  // column on `users` and no signup-source table. We surface a best-effort
  // fallback: the breakdown of users by the source of their *earliest*
  // synced session in the last 30 days. This proxies "where they came in
  // from" — landing-page hits, GitHub OAuth events, and join-link clicks
  // are not logged anywhere queryable.
  const days = last30Days();
  const firstDay = days[0];
  if (!firstDay) {
    return c.json<AdminReferrersResponse>({
      tracked: false,
      signal: "First CLI source (last 30 days)",
      rows: [],
      generatedAt: Date.now(),
    });
  }
  const windowStartMs = dayStartMs(firstDay);

  // For each user, find their earliest session's source within the window,
  // then count users by that source. Users with no session in the window
  // are excluded from the proxy.
  const rows = await c.env.DB.prepare(
    `SELECT first_source AS source, COUNT(*) AS n
     FROM (
       SELECT user_id,
              (SELECT s2.source
                 FROM sessions s2
                 WHERE s2.user_id = s.user_id
                   AND s2.started_at >= ?
                 ORDER BY s2.started_at ASC
                 LIMIT 1) AS first_source
       FROM sessions s
       WHERE s.started_at >= ?
       GROUP BY user_id
     )
     WHERE first_source IS NOT NULL
     GROUP BY first_source
     ORDER BY n DESC`,
  )
    .bind(windowStartMs, windowStartMs)
    .all<{ source: string; n: number }>();

  const payload: AdminReferrersResponse = {
    tracked: false,
    signal: "First CLI source (last 30 days)",
    rows: (rows.results ?? []).map((r) => ({ label: r.source, count: r.n })),
    generatedAt: Date.now(),
  };
  return c.json(payload);
});

export default admin;
