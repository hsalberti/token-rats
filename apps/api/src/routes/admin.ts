import type {
  AdminActivityResponse,
  AdminReferrersResponse,
  AdminSignupsResponse,
  GetPendingOrgsResponse,
} from "@token-rats/contracts";
/**
 * GET /v1/admin/signups    — total user count + cumulative signups by UTC day (30d)
 * GET /v1/admin/activity   — distinct active users per UTC day (30d)
 * GET /v1/admin/referrers  — top referrers by signups brought in via ?ref=<code>
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
import { forbidden, notFound } from "../lib/errors.js";
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

  // daily_rollup.day is already YYYY-MM-DD UTC, derived from each CLI
  // session's `started_at` (the time the user ran Claude Code / Cursor
  // locally). The CLI uploads the user's *local log history* on first
  // sync, which can predate signup by weeks or months. For platform
  // analytics, that pre-signup history is not "the user was active on
  // the platform" — it's "the user uploaded an old log on signup day."
  //
  // Clamp `day >= signup day` so a user only counts as platform-active
  // starting the UTC day their account was created. Personal heatmaps
  // (profiles) deliberately don't clamp — there we want the full
  // historical view of the user's own work.
  const perDay = await c.env.DB.prepare(
    `SELECT dr.day, COUNT(DISTINCT dr.user_id) AS n
     FROM daily_rollup dr
     JOIN users u ON u.id = dr.user_id
     WHERE dr.day >= ?
       AND dr.day >= strftime('%Y-%m-%d', u.created_at / 1000, 'unixepoch')
     GROUP BY dr.day`,
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

  // 30-day distinct active users (any day in the window, clamped to the
  // user's signup day for the same reason as above).
  const totalRow = await c.env.DB.prepare(
    `SELECT COUNT(DISTINCT dr.user_id) AS n
     FROM daily_rollup dr
     JOIN users u ON u.id = dr.user_id
     WHERE dr.day >= ?
       AND dr.day >= strftime('%Y-%m-%d', u.created_at / 1000, 'unixepoch')`,
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

const TOP_REFERRERS_LIMIT = 100;

admin.get("/referrers", async (c) => {
  // Top referrers from the `referrals` table (migration 0007). Each row is
  // a user who has brought in at least one signup via their `?ref=<code>`
  // link. Capped at TOP_REFERRERS_LIMIT — admin-only, so the cap is
  // generous; a public version (with masking) can be derived later.
  const rows = await c.env.DB.prepare(
    `SELECT u.handle, u.avatar_url AS avatarUrl, COUNT(*) AS n
       FROM referrals r
       JOIN users u ON u.id = r.referrer_user_id
      GROUP BY r.referrer_user_id
      ORDER BY n DESC, u.handle ASC
      LIMIT ?`,
  )
    .bind(TOP_REFERRERS_LIMIT)
    .all<{ handle: string; avatarUrl: string | null; n: number }>();

  const payload: AdminReferrersResponse = {
    rows: (rows.results ?? []).map((r) => ({
      handle: r.handle,
      avatarUrl: r.avatarUrl,
      count: r.n,
    })),
    generatedAt: Date.now(),
  };
  return c.json(payload);
});

/* -------------------------------------------------------------------------- */
/* GET /v1/admin/orgs/pending?q=<search>                                       */
/* -------------------------------------------------------------------------- */
/* Searchable list of pending orgs. Search matches name / slug / founder      */
/* email substrings (case-insensitive). Capped at 100 rows.                   */

admin.get("/orgs/pending", async (c) => {
  const q = new URL(c.req.url).searchParams.get("q")?.trim() ?? "";

  let rows: { results?: PendingOrgRow[] };
  if (q.length === 0) {
    rows = await c.env.DB.prepare(
      `SELECT o.id, o.name, o.slug, o.requested_plan, o.founder_email,
              o.founder_name, o.created_at, u.handle AS founder_handle
         FROM orgs o
         LEFT JOIN org_members om
                ON om.org_id = o.id AND om.role = 'owner'
         LEFT JOIN users u
                ON u.id = om.user_id
        WHERE o.status = 'pending'
        ORDER BY o.created_at DESC
        LIMIT 100`,
    ).all<PendingOrgRow>();
  } else {
    const wild = `%${q.toLowerCase()}%`;
    rows = await c.env.DB.prepare(
      `SELECT o.id, o.name, o.slug, o.requested_plan, o.founder_email,
              o.founder_name, o.created_at, u.handle AS founder_handle
         FROM orgs o
         LEFT JOIN org_members om
                ON om.org_id = o.id AND om.role = 'owner'
         LEFT JOIN users u
                ON u.id = om.user_id
        WHERE o.status = 'pending'
          AND (
                LOWER(o.name)          LIKE ?
             OR LOWER(o.slug)          LIKE ?
             OR LOWER(o.founder_email) LIKE ?
             OR LOWER(u.handle)        LIKE ?
          )
        ORDER BY o.created_at DESC
        LIMIT 100`,
    )
      .bind(wild, wild, wild, wild)
      .all<PendingOrgRow>();
  }

  const payload: GetPendingOrgsResponse = {
    orgs: (rows.results ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      requestedPlan: (r.requested_plan ?? null) as "free" | "student" | "pro" | null,
      founderEmail: r.founder_email,
      founderName: r.founder_name,
      founderHandle: r.founder_handle ?? "",
      createdAt: r.created_at,
    })),
  };
  return c.json(payload);
});

/* -------------------------------------------------------------------------- */
/* POST /v1/admin/orgs/:slug/approve                                          */
/* -------------------------------------------------------------------------- */

admin.post("/orgs/:slug/approve", async (c) => {
  const slug = c.req.param("slug");
  const adminUserId = c.var.userId;

  const org = await c.env.DB.prepare("SELECT id, status, requested_plan FROM orgs WHERE slug = ?")
    .bind(slug)
    .first<{ id: string; status: string; requested_plan: string | null }>();

  if (!org) return notFound(c, "Org not found");
  if (org.status === "approved") {
    return forbidden(c, "Org is already approved");
  }

  // Promote the requested_plan to the live plan. Student tier becomes
  // usable immediately; pro tier is also immediate in this round (Stripe
  // checkout email defers to roadmap-deferred.md).
  const newPlan = (org.requested_plan ?? "free") as "free" | "student" | "pro";
  const now = Date.now();

  await c.env.DB.prepare(
    `UPDATE orgs
        SET status = 'approved',
            plan = ?,
            approved_by = ?,
            approved_at = ?
      WHERE id = ?`,
  )
    .bind(newPlan, adminUserId, now, org.id)
    .run();

  // Read-back the now-approved org for the response.
  const refreshed = await c.env.DB.prepare(
    `SELECT id, name, slug, plan, seat_count, github_org_login, created_at,
            status, requested_plan, founder_email, founder_name
       FROM orgs WHERE id = ?`,
  )
    .bind(org.id)
    .first<{
      id: string;
      name: string;
      slug: string | null;
      plan: string;
      seat_count: number;
      github_org_login: string | null;
      created_at: number;
      status: string;
      requested_plan: string | null;
      founder_email: string | null;
      founder_name: string | null;
    }>();

  if (!refreshed) return notFound(c, "Org not found");

  return c.json({
    org: {
      id: refreshed.id,
      name: refreshed.name,
      slug: refreshed.slug,
      plan: refreshed.plan as "free" | "student" | "pro",
      seatCount: refreshed.seat_count,
      githubOrgLogin: refreshed.github_org_login,
      createdAt: refreshed.created_at,
      status: refreshed.status as "pending" | "approved",
      requestedPlan: (refreshed.requested_plan ?? null) as "free" | "student" | "pro" | null,
      founderEmail: refreshed.founder_email,
      founderName: refreshed.founder_name,
    },
  });
});

interface PendingOrgRow {
  id: string;
  name: string;
  slug: string | null;
  requested_plan: string | null;
  founder_email: string | null;
  founder_name: string | null;
  founder_handle: string | null;
  created_at: number;
}

export default admin;
