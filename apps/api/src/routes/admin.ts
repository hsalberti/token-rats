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
import { toUtcDay } from "../lib/ingest.js";
import { refreshPrices } from "../lib/price-refresh.js";
import { priceOf } from "../lib/pricing.js";
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

/* -------------------------------------------------------------------------- */
/* POST /v1/admin/prices/refresh — run the daily cron on demand               */
/* -------------------------------------------------------------------------- */

admin.post("/prices/refresh", async (c) => {
  const result = await refreshPrices(c.env);
  return c.json(result);
});

/* -------------------------------------------------------------------------- */
/* GET /v1/admin/prices/needs-source — models we bill against but can't price */
/*                                                                            */
/* Drives the "guide our roadmap" loop: every session-inferred row plus any   */
/* catalog row with no snapshot ≤ today shows up here so we know what's       */
/* missing from OpenRouter coverage.                                          */
/* -------------------------------------------------------------------------- */

admin.get("/prices/needs-source", async (c) => {
  const inferred = await c.env.DB.prepare(
    `SELECT id, provider, first_seen_day, last_seen_day, notes
       FROM models_catalog
      WHERE source = 'session-inferred'
      ORDER BY last_seen_day DESC, id ASC
      LIMIT 200`,
  ).all<{
    id: string;
    provider: string;
    first_seen_day: string;
    last_seen_day: string;
    notes: string | null;
  }>();

  const unpriced = await c.env.DB.prepare(
    `SELECT c.id, c.provider, c.last_seen_day
       FROM models_catalog c
      WHERE c.is_active = 1
        AND NOT EXISTS (SELECT 1 FROM model_price_snapshots s WHERE s.model_id = c.id)
      ORDER BY c.last_seen_day DESC, c.id ASC
      LIMIT 200`,
  ).all<{ id: string; provider: string; last_seen_day: string }>();

  return c.json({
    sessionInferred: inferred.results ?? [],
    unpriced: unpriced.results ?? [],
  });
});

/* -------------------------------------------------------------------------- */
/* POST /v1/admin/prices/recompute — restamp cost on every session            */
/*                                                                            */
/* Walks `sessions` in chunks of 500, recomputes `cost_usd_cents` via the     */
/* D1 price catalog at each session's UTC day, then rebuilds the legacy and   */
/* granular daily_rollup tables from scratch so the leaderboard agrees with   */
/* the freshly-stamped session rows.                                          */
/*                                                                            */
/* Idempotent. `dryRun=true` query param returns counts without writing.      */
/* -------------------------------------------------------------------------- */

interface SessionToRestamp {
  id: string;
  user_id: string;
  model: string;
  in_tokens: number;
  out_tokens: number;
  started_at: number;
  cost_usd_cents: number;
}

const RECOMPUTE_CHUNK = 500;

admin.post("/prices/recompute", async (c) => {
  const dryRun = c.req.query("dryRun") === "true";

  // Snapshot: total sessions for paging
  const countRow = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM sessions").first<{
    n: number;
  }>();
  const total = countRow?.n ?? 0;

  let processed = 0;
  let changed = 0;
  let centsDelta = 0;
  let offset = 0;

  while (offset < total) {
    const page = await c.env.DB.prepare(
      `SELECT id, user_id, model, in_tokens, out_tokens, started_at, cost_usd_cents
         FROM sessions
        ORDER BY started_at ASC
        LIMIT ? OFFSET ?`,
    )
      .bind(RECOMPUTE_CHUNK, offset)
      .all<SessionToRestamp>();

    const rows = page.results ?? [];
    if (rows.length === 0) break;

    const updates: { id: string; newCost: number; oldCost: number }[] = [];
    for (const r of rows) {
      const { costUsdCents } = await priceOf(
        c.env,
        r.model,
        toUtcDay(r.started_at),
        r.in_tokens,
        r.out_tokens,
      );
      if (costUsdCents !== r.cost_usd_cents) {
        updates.push({ id: r.id, newCost: costUsdCents, oldCost: r.cost_usd_cents });
      }
    }

    if (updates.length > 0 && !dryRun) {
      const stmts = updates.map((u) =>
        c.env.DB.prepare("UPDATE sessions SET cost_usd_cents = ? WHERE id = ?").bind(
          u.newCost,
          u.id,
        ),
      );
      await c.env.DB.batch(stmts);
    }

    changed += updates.length;
    centsDelta += updates.reduce((s, u) => s + (u.newCost - u.oldCost), 0);
    processed += rows.length;
    offset += rows.length;
  }

  if (!dryRun && changed > 0) {
    // Rebuild rollups from authoritative sessions. SQLite has no TRUNCATE, so
    // DELETE then INSERT … SELECT. This wipes empty-table-day rows that legitimately
    // existed (e.g. a user-day with 0 sessions can never appear here anyway —
    // rollups are only populated via inserts).
    await c.env.DB.batch([
      c.env.DB.prepare("DELETE FROM daily_rollup"),
      c.env.DB.prepare(
        `INSERT INTO daily_rollup (user_id, day, tokens, cost_usd_cents, sessions)
         SELECT user_id,
                strftime('%Y-%m-%d', started_at / 1000, 'unixepoch') AS day,
                SUM(in_tokens + out_tokens),
                SUM(cost_usd_cents),
                COUNT(*)
           FROM sessions
          GROUP BY user_id, day`,
      ),
      c.env.DB.prepare("DELETE FROM daily_rollup_by_model"),
      c.env.DB.prepare(
        `INSERT INTO daily_rollup_by_model
            (user_id, day, source, provider, model,
             in_tokens, out_tokens,
             cache_read_tokens, cache_write_tokens, reasoning_tokens,
             cost_usd_cents, sessions)
         SELECT user_id,
                strftime('%Y-%m-%d', started_at / 1000, 'unixepoch') AS day,
                source, provider, model,
                SUM(in_tokens), SUM(out_tokens),
                SUM(cache_read_tokens), SUM(cache_write_tokens), SUM(reasoning_tokens),
                SUM(cost_usd_cents), COUNT(*)
           FROM sessions
          GROUP BY user_id, day, source, provider, model`,
      ),
    ]);
  }

  return c.json({
    total,
    processed,
    changed,
    centsDelta,
    dryRun,
    rollupsRebuilt: !dryRun && changed > 0,
  });
});

export default admin;
