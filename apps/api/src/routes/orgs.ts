/**
 * Org routes — Phase 3 Track O + v1.2 Track AA (soft-create / student tier)
 *
 *  POST  /v1/orgs                      – create org (auth required; soft-create as `pending`)
 *  GET   /v1/orgs/:slug                – org details
 *                                          - active orgs: member-gated
 *                                          - pending orgs: founder-only (everyone else 404)
 *  POST  /v1/orgs/:slug/invites        – create invite (admin/owner only)
 *  POST  /v1/orgs/:slug/accept         – accept invite (auth required)
 *  GET   /v1/orgs/:slug/dashboard      – aggregate spend stats (member-only)
 */

import { Hono } from "hono";
import { z } from "zod";
import {
  CreateOrgInviteRequest as CreateOrgInviteRequestSchema,
  CreateOrgRequest as CreateOrgRequestSchema,
} from "@token-rats/contracts";
import type { Env } from "../env.js";
import type { AuthVariables } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";
import { validationError, notFound, forbidden } from "../lib/errors.js";
import { MONTH_MS } from "../lib/time.js";

type HonoEnv = { Bindings: Env; Variables: AuthVariables };

const orgs = new Hono<HonoEnv>();

/* ------------------------------------------------------------------ helpers */

type OrgRow = {
  id: string;
  name: string;
  slug: string | null;
  plan: string;
  seat_count: number;
  github_org_login: string | null;
  created_at: number;
  status: string;
};

/** Lookup an org by slug. Returns null if not found. */
async function getOrgBySlug(db: D1Database, slug: string): Promise<OrgRow | null> {
  return db
    .prepare(
      `SELECT id, name, slug, plan, seat_count, github_org_login, created_at, status
       FROM orgs WHERE slug = ?`,
    )
    .bind(slug)
    .first<OrgRow>();
}

/** Check that userId is a member of orgId; returns their role or null. */
async function getMembership(
  db: D1Database,
  orgId: string,
  userId: string,
): Promise<string | null> {
  const row = await db
    .prepare("SELECT role FROM org_members WHERE org_id = ? AND user_id = ?")
    .bind(orgId, userId)
    .first<{ role: string }>();
  return row?.role ?? null;
}

/** Resolve the caller's email + handle (for waitlist auto-insert / founder lookups). */
async function getCallerIdentity(
  db: D1Database,
  userId: string,
): Promise<{ email: string; handle: string } | null> {
  const row = await db
    .prepare("SELECT handle, email FROM users WHERE id = ?")
    .bind(userId)
    .first<{ handle: string; email: string | null }>();
  if (!row) return null;
  // `users.email` may be null until Track AB's OAuth scope upgrade backfills it.
  // Fall back to GitHub's deterministic noreply address so the (topic, email)
  // uniqueness key on `waitlists` stays meaningful.
  const email = row.email ?? `${row.handle}@users.noreply.github.com`;
  return { email, handle: row.handle };
}

/** Map a raw orgs row to the contract shape. */
function serializeOrg(row: OrgRow) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    plan: row.plan as "free" | "pro" | "student",
    seatCount: row.seat_count,
    githubOrgLogin: row.github_org_login,
    createdAt: row.created_at,
    status: (row.status === "pending" ? "pending" : "active") as "active" | "pending",
  };
}

/* ------------------------------------------------------------------ POST /v1/orgs */

orgs.post("/", requireAuth, async (c) => {
  const userId = c.var.userId;

  let body: z.infer<typeof CreateOrgRequestSchema>;
  try {
    const raw: unknown = await c.req.json();
    body = CreateOrgRequestSchema.parse(raw);
  } catch (e) {
    return validationError(c, e instanceof Error ? e.message : e);
  }

  const caller = await getCallerIdentity(c.env.DB, userId);
  if (!caller) return notFound(c, "User not found");

  // Slug uniqueness — check across both active and pending orgs.
  const slugConflict = await c.env.DB.prepare(
    "SELECT id, status FROM orgs WHERE slug = ?",
  )
    .bind(body.slug)
    .first<{ id: string; status: string }>();

  // Idempotent re-submit: if the caller already owns a *pending* org at this
  // slug, return the existing org + the original waitlist position instead of
  // erroring. Any other conflict (someone else's slug, or an active org) is a
  // hard error so we don't leak existence — just say "slug is taken".
  if (slugConflict) {
    if (slugConflict.status === "pending") {
      const role = await getMembership(c.env.DB, slugConflict.id, userId);
      if (role === "owner") {
        const existingOrg = await c.env.DB.prepare(
          `SELECT id, name, slug, plan, seat_count, github_org_login, created_at, status
           FROM orgs WHERE id = ?`,
        )
          .bind(slugConflict.id)
          .first<OrgRow>();

        // Position = 1-indexed rank of the caller's waitlist row within topic='orgs',
        // ordered by created_at ASC (FIFO). Returns the *original* slot, not a new one.
        const positionRow = await c.env.DB.prepare(
          `SELECT COUNT(*) AS pos FROM waitlists
           WHERE topic = 'orgs' AND created_at <= (
             SELECT created_at FROM waitlists WHERE topic = 'orgs' AND email = ?
           )`,
        )
          .bind(caller.email)
          .first<{ pos: number }>();

        if (existingOrg) {
          return c.json(
            {
              org: serializeOrg(existingOrg),
              waitlistPosition: positionRow?.pos ?? 1,
            },
            200,
          );
        }
      }
    }
    return validationError(c, "Slug is already taken");
  }

  const id = crypto.randomUUID();
  const now = Date.now();
  const plan = body.student ? "student" : "free";

  // Soft-create: every new org is `pending` until an admin approves it.
  // Org row + owner membership in one batch — same as the active flow.
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO orgs (id, name, slug, plan, seat_count, github_org_login, created_at, status)
       VALUES (?, ?, ?, ?, 0, ?, ?, 'pending')`,
    ).bind(id, body.name, body.slug, plan, body.githubOrgLogin ?? null, now),
    c.env.DB.prepare(
      `INSERT INTO org_members (org_id, user_id, role) VALUES (?, ?, 'owner')`,
    ).bind(id, userId),
  ]);

  // Mirror into the waitlists table so the admin queue is a single read of
  // `topic='orgs'` regardless of which surface ingested the row.
  const payload = JSON.stringify({
    slug: body.slug,
    name: body.name,
    plan,
    ...(body.university ? { university: body.university } : {}),
    ...(body.note ? { note: body.note } : {}),
  });

  // Idempotent on (topic, email). If the caller already has a row in
  // topic='orgs' (e.g. they re-submitted with a *different* slug after
  // hitting the slug-taken branch above) we leave the original row intact
  // and just compute their existing position.
  await c.env.DB.prepare(
    `INSERT INTO waitlists (id, topic, email, github_login, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(topic, email) DO NOTHING`,
  )
    .bind(crypto.randomUUID(), "orgs", caller.email, caller.handle, payload, now)
    .run();

  const positionRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS pos FROM waitlists
     WHERE topic = 'orgs' AND created_at <= (
       SELECT created_at FROM waitlists WHERE topic = 'orgs' AND email = ?
     )`,
  )
    .bind(caller.email)
    .first<{ pos: number }>();

  return c.json(
    {
      org: {
        id,
        name: body.name,
        slug: body.slug,
        plan,
        seatCount: 0,
        githubOrgLogin: body.githubOrgLogin ?? null,
        createdAt: now,
        status: "pending" as const,
      },
      waitlistPosition: positionRow?.pos ?? 1,
    },
    201,
  );
});

/* ------------------------------------------------------------------ GET /v1/orgs/:slug */

orgs.get("/:slug", requireAuth, async (c) => {
  const userId = c.var.userId;
  const slug = c.req.param("slug");

  const org = await getOrgBySlug(c.env.DB, slug);
  if (!org) return notFound(c, "Org not found");

  const role = await getMembership(c.env.DB, org.id, userId);

  // Pending orgs are visible to the founder only — to anyone else we 404 so
  // we don't leak existence of reserved slugs (and so the dashboard doesn't
  // render a half-real org).
  if (org.status === "pending") {
    if (role !== "owner") return notFound(c, "Org not found");
  } else {
    if (!role) return forbidden(c, "You are not a member of this org");
  }

  const membersResult = await c.env.DB.prepare(
    `SELECT om.user_id, om.role, u.handle, u.avatar_url
     FROM org_members om
     JOIN users u ON u.id = om.user_id
     WHERE om.org_id = ?
     ORDER BY om.role ASC`,
  )
    .bind(org.id)
    .all<{
      user_id: string;
      role: string;
      handle: string;
      avatar_url: string | null;
    }>();

  const members = (membersResult.results ?? []).map((m) => ({
    userId: m.user_id,
    handle: m.handle,
    avatarUrl: m.avatar_url,
    role: m.role,
  }));

  // For pending orgs surfaced to the founder, include their waitlist position
  // so the /o/<slug>/pending page can render "you're #N" without a second hop.
  let waitlistPosition: number | undefined;
  if (org.status === "pending" && role === "owner") {
    const caller = await getCallerIdentity(c.env.DB, userId);
    if (caller) {
      const positionRow = await c.env.DB.prepare(
        `SELECT COUNT(*) AS pos FROM waitlists
         WHERE topic = 'orgs' AND created_at <= (
           SELECT created_at FROM waitlists WHERE topic = 'orgs' AND email = ?
         )`,
      )
        .bind(caller.email)
        .first<{ pos: number }>();
      waitlistPosition = positionRow?.pos ?? undefined;
    }
  }

  return c.json({
    org: serializeOrg(org),
    members,
    ...(waitlistPosition && waitlistPosition > 0 ? { waitlistPosition } : {}),
  });
});

/* ------------------------------------------------------------------ POST /v1/orgs/:slug/invites */

orgs.post("/:slug/invites", requireAuth, async (c) => {
  const userId = c.var.userId;
  const slug = c.req.param("slug");

  let body: z.infer<typeof CreateOrgInviteRequestSchema>;
  try {
    const raw: unknown = await c.req.json();
    body = CreateOrgInviteRequestSchema.parse(raw);
  } catch (e) {
    return validationError(c, e instanceof Error ? e.message : e);
  }

  const org = await getOrgBySlug(c.env.DB, slug);
  if (!org) return notFound(c, "Org not found");

  const role = await getMembership(c.env.DB, org.id, userId);
  if (!role || (role !== "owner" && role !== "admin")) {
    return forbidden(c, "Only org owners and admins can send invites");
  }

  const id = crypto.randomUUID();
  const now = Date.now();

  await c.env.DB.prepare(
    `INSERT INTO org_invites (id, org_id, email, github_login, invited_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, org.id, body.email ?? null, body.githubLogin ?? null, userId, now)
    .run();

  return c.json(
    {
      invite: {
        id,
        orgId: org.id,
        email: body.email ?? null,
        githubLogin: body.githubLogin ?? null,
        invitedBy: userId,
        createdAt: now,
        acceptedAt: null,
      },
    },
    201,
  );
});

/* ------------------------------------------------------------------ POST /v1/orgs/:slug/accept */

orgs.post("/:slug/accept", requireAuth, async (c) => {
  const userId = c.var.userId;
  const slug = c.req.param("slug");

  const org = await getOrgBySlug(c.env.DB, slug);
  if (!org) return notFound(c, "Org not found");

  // Look up the accepting user's handle (for GitHub login match)
  const user = await c.env.DB.prepare(
    "SELECT id, handle FROM users WHERE id = ?",
  )
    .bind(userId)
    .first<{ id: string; handle: string }>();

  if (!user) return notFound(c, "User not found");

  // Find an un-accepted invite matching email OR github_login.
  // We match github_login against the user's handle (their GitHub login).
  const invite = await c.env.DB.prepare(
    `SELECT id FROM org_invites
     WHERE org_id = ?
       AND accepted_at IS NULL
       AND (github_login = ?)
     LIMIT 1`,
  )
    .bind(org.id, user.handle)
    .first<{ id: string }>();

  if (!invite) {
    return notFound(c, "No pending invite found for your GitHub login");
  }

  const now = Date.now();

  // Mark invite accepted and add org membership (idempotent via INSERT OR IGNORE)
  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE org_invites SET accepted_at = ? WHERE id = ?",
    ).bind(now, invite.id),
    c.env.DB.prepare(
      "INSERT OR IGNORE INTO org_members (org_id, user_id, role) VALUES (?, ?, 'member')",
    ).bind(org.id, userId),
  ]);

  return c.json({ ok: true });
});

/* ------------------------------------------------------------------ GET /v1/orgs/:slug/dashboard */

orgs.get("/:slug/dashboard", requireAuth, async (c) => {
  const userId = c.var.userId;
  const slug = c.req.param("slug");

  const org = await getOrgBySlug(c.env.DB, slug);
  if (!org) return notFound(c, "Org not found");

  const role = await getMembership(c.env.DB, org.id, userId);
  if (!role) return forbidden(c, "You are not a member of this org");

  // Compute the 30-day window
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - MONTH_MS).toISOString().slice(0, 10);

  // Spend by user: sum daily_rollup for all org members (top 50)
  const byUserResult = await c.env.DB.prepare(
    `SELECT dr.user_id, u.handle, u.avatar_url,
            SUM(dr.tokens)         AS tokens,
            SUM(dr.cost_usd_cents) AS cost_usd_cents
     FROM daily_rollup dr
     JOIN users u ON u.id = dr.user_id
     JOIN org_members om ON om.user_id = dr.user_id AND om.org_id = ?
     WHERE dr.day >= ?
     GROUP BY dr.user_id, u.handle, u.avatar_url
     ORDER BY cost_usd_cents DESC
     LIMIT 50`,
  )
    .bind(org.id, thirtyDaysAgo)
    .all<{
      user_id: string;
      handle: string;
      avatar_url: string | null;
      tokens: number;
      cost_usd_cents: number;
    }>();

  // Spend by model: aggregate across org members for last 30d
  const byModelResult = await c.env.DB.prepare(
    `SELECT s.model,
            SUM(s.in_tokens + s.out_tokens) AS tokens,
            SUM(s.cost_usd_cents)            AS cost_usd_cents
     FROM sessions s
     JOIN org_members om ON om.user_id = s.user_id AND om.org_id = ?
     WHERE s.started_at >= ?
     GROUP BY s.model
     ORDER BY cost_usd_cents DESC`,
  )
    .bind(
      org.id,
      now.getTime() - MONTH_MS,
    )
    .all<{
      model: string;
      tokens: number;
      cost_usd_cents: number;
    }>();

  // Spend by day: last 30d, all org members combined
  const byDayResult = await c.env.DB.prepare(
    `SELECT dr.day,
            SUM(dr.tokens)         AS tokens,
            SUM(dr.cost_usd_cents) AS cost_usd_cents
     FROM daily_rollup dr
     JOIN org_members om ON om.user_id = dr.user_id AND om.org_id = ?
     WHERE dr.day >= ?
     GROUP BY dr.day
     ORDER BY dr.day ASC`,
  )
    .bind(org.id, thirtyDaysAgo)
    .all<{
      day: string;
      tokens: number;
      cost_usd_cents: number;
    }>();

  const spendByUser = (byUserResult.results ?? []).map((r) => ({
    userId: r.user_id,
    handle: r.handle,
    avatarUrl: r.avatar_url,
    tokens: r.tokens,
    costUsdCents: r.cost_usd_cents,
  }));

  const spendByModel = (byModelResult.results ?? []).map((r) => ({
    model: r.model,
    tokens: r.tokens,
    costUsdCents: r.cost_usd_cents,
  }));

  const spendByDay = (byDayResult.results ?? []).map((r) => ({
    day: r.day,
    tokens: r.tokens,
    costUsdCents: r.cost_usd_cents,
  }));

  return c.json({
    dashboard: {
      spendByUser,
      spendByModel,
      spendByDay,
    },
  });
});

export default orgs;
