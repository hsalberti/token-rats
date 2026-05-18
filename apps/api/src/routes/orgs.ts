/**
 * Org routes — Phase 3 Track O
 *
 *  POST  /v1/orgs                      – create org (auth required)
 *  GET   /v1/orgs/:slug                – org details (member-only)
 *  POST  /v1/orgs/:slug/invites        – create invite (admin/owner only)
 *  POST  /v1/orgs/:slug/accept         – accept invite (auth required)
 *  GET   /v1/orgs/:slug/dashboard      – aggregate spend stats (member-only)
 */

import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../env.js";
import { forbidden, notFound, validationError } from "../lib/errors.js";
import type { AuthVariables } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";

/* ---- inline Zod schemas to avoid the type-only re-export collision in api.ts ---- */

const CreateOrgRequestSchema = z.object({
  name: z.string().min(1).max(64),
  slug: z
    .string()
    .min(3)
    .max(48)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only"),
  githubOrgLogin: z.string().optional(),
});

const CreateOrgInviteRequestSchema = z
  .object({
    email: z.string().email().optional(),
    githubLogin: z.string().optional(),
  })
  .refine((d) => d.email || d.githubLogin, {
    message: "Either email or githubLogin is required",
  });

type HonoEnv = { Bindings: Env; Variables: AuthVariables };

const orgs = new Hono<HonoEnv>();

/* ------------------------------------------------------------------ helpers */

/** Lookup an org by slug. Returns null if not found. */
async function getOrgBySlug(
  db: D1Database,
  slug: string,
): Promise<{
  id: string;
  name: string;
  slug: string | null;
  plan: string;
  seat_count: number;
  github_org_login: string | null;
  created_at: number;
} | null> {
  return db
    .prepare(
      `SELECT id, name, slug, plan, seat_count, github_org_login, created_at
       FROM orgs WHERE slug = ?`,
    )
    .bind(slug)
    .first<{
      id: string;
      name: string;
      slug: string | null;
      plan: string;
      seat_count: number;
      github_org_login: string | null;
      created_at: number;
    }>();
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

/* ------------------------------------------------------------------ POST /v1/orgs */

orgs.post("/", requireAuth, async (c) => {
  const userId = c.var.userId;

  let body: ReturnType<typeof CreateOrgRequestSchema.parse>;
  try {
    const raw: unknown = await c.req.json();
    body = CreateOrgRequestSchema.parse(raw);
  } catch (e) {
    return validationError(c, e instanceof Error ? e.message : e);
  }

  // Check slug uniqueness
  const slugConflict = await c.env.DB.prepare("SELECT id FROM orgs WHERE slug = ?")
    .bind(body.slug)
    .first<{ id: string }>();

  if (slugConflict) {
    return validationError(c, "Slug is already taken");
  }

  const id = crypto.randomUUID();
  const now = Date.now();

  // TODO: create stripe.com customer here, store stripe_customer_id

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO orgs (id, name, slug, plan, seat_count, github_org_login, created_at)
       VALUES (?, ?, ?, 'free', 0, ?, ?)`,
    ).bind(id, body.name, body.slug, body.githubOrgLogin ?? null, now),
    c.env.DB.prepare(`INSERT INTO org_members (org_id, user_id, role) VALUES (?, ?, 'owner')`).bind(
      id,
      userId,
    ),
  ]);

  return c.json(
    {
      org: {
        id,
        name: body.name,
        slug: body.slug,
        plan: "free" as const,
        seatCount: 0,
        githubOrgLogin: body.githubOrgLogin ?? null,
        createdAt: now,
      },
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
  if (!role) return forbidden(c, "You are not a member of this org");

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

  return c.json({
    org: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      plan: org.plan,
      seatCount: org.seat_count,
      githubOrgLogin: org.github_org_login,
      createdAt: org.created_at,
    },
    members,
  });
});

/* ------------------------------------------------------------------ POST /v1/orgs/:slug/invites */

orgs.post("/:slug/invites", requireAuth, async (c) => {
  const userId = c.var.userId;
  const slug = c.req.param("slug");

  let body: ReturnType<typeof CreateOrgInviteRequestSchema.parse>;
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
  const user = await c.env.DB.prepare("SELECT id, handle FROM users WHERE id = ?")
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
    c.env.DB.prepare("UPDATE org_invites SET accepted_at = ? WHERE id = ?").bind(now, invite.id),
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
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

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
    .bind(org.id, new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).getTime())
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
