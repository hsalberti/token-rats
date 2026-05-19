/**
 * Org routes — Phase 3 Track O + v1.2 soft-create.
 *
 *  POST   /v1/orgs                 – soft-create an org (auth required, 1-per-user cap)
 *  GET    /v1/orgs/:slug           – org details (member-only when approved; founder
 *                                    can fetch their own pending org)
 *  PATCH  /v1/orgs/:slug           – founder updates founder_email / founder_name
 *                                    while still pending
 *  POST   /v1/orgs/:slug/invites   – create invite (admin/owner only, approved only)
 *  POST   /v1/orgs/:slug/accept    – accept invite
 *  GET    /v1/orgs/:slug/dashboard – aggregate spend stats (member-only, approved only)
 */

import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../env.js";
import { conflict, forbidden, notFound, validationError } from "../lib/errors.js";
import { MONTH_MS } from "../lib/time.js";
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
  founderEmail: z.string().email(),
  founderName: z.string().min(1).max(80).optional(),
  requestedPlan: z.enum(["free", "student", "pro"]),
});

const PatchOrgRequestSchema = z.object({
  founderEmail: z.string().email().optional(),
  founderName: z.string().min(1).max(80).optional(),
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

interface OrgRow {
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
}

const ORG_SELECT_COLUMNS =
  "id, name, slug, plan, seat_count, github_org_login, created_at, " +
  "status, requested_plan, founder_email, founder_name";

async function getOrgBySlug(db: D1Database, slug: string): Promise<OrgRow | null> {
  return db
    .prepare(`SELECT ${ORG_SELECT_COLUMNS} FROM orgs WHERE slug = ?`)
    .bind(slug)
    .first<OrgRow>();
}

/** Find the founder (owner) row for an org. */
async function getOwnerId(db: D1Database, orgId: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT user_id FROM org_members WHERE org_id = ? AND role = 'owner' LIMIT 1")
    .bind(orgId)
    .first<{ user_id: string }>();
  return row?.user_id ?? null;
}

/** Membership lookup — returns role or null. */
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

/** Project an `OrgRow` into the Org contract shape. */
function orgPayload(row: OrgRow) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    plan: row.plan as "free" | "student" | "pro",
    seatCount: row.seat_count,
    githubOrgLogin: row.github_org_login,
    createdAt: row.created_at,
    status: row.status as "pending" | "approved",
    requestedPlan: (row.requested_plan ?? null) as "free" | "student" | "pro" | null,
    founderEmail: row.founder_email,
    founderName: row.founder_name,
  };
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

  // 1-per-user cap: a user may not have a second pending OR approved org.
  // The check is done before any writes so a user can re-submit after
  // re-trying a slug collision without ending up in a 409 deadlock.
  const existing = await c.env.DB.prepare(
    `SELECT o.slug FROM orgs o
       JOIN org_members om ON om.org_id = o.id AND om.user_id = ? AND om.role = 'owner'
      LIMIT 1`,
  )
    .bind(userId)
    .first<{ slug: string | null }>();

  if (existing) {
    return conflict(c, "You already have an org", {
      existingSlug: existing.slug,
    });
  }

  // Slug uniqueness check (no race protection beyond idx_orgs_slug — D1's
  // serial nature makes this fine for the failure mode we care about).
  const slugConflict = await c.env.DB.prepare("SELECT id FROM orgs WHERE slug = ?")
    .bind(body.slug)
    .first<{ id: string }>();

  if (slugConflict) {
    return validationError(c, "Slug is already taken");
  }

  const id = crypto.randomUUID();
  const now = Date.now();

  // Soft-create: status='pending', plan stays at the default 'free' until
  // approval flips it. `requested_plan` carries the user's intent.
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO orgs
         (id, name, slug, plan, seat_count, github_org_login, created_at,
          status, requested_plan, founder_email, founder_name)
       VALUES
         (?, ?, ?, 'free', 0, ?, ?,
          'pending', ?, ?, ?)`,
    ).bind(
      id,
      body.name,
      body.slug,
      body.githubOrgLogin ?? null,
      now,
      body.requestedPlan,
      body.founderEmail,
      body.founderName ?? null,
    ),
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
        status: "pending" as const,
        requestedPlan: body.requestedPlan,
        founderEmail: body.founderEmail,
        founderName: body.founderName ?? null,
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

  // Pending org: only the founder can fetch their own pending org (the
  // pending page reads this to populate the form). Everyone else 403s.
  if (org.status === "pending") {
    const ownerId = await getOwnerId(c.env.DB, org.id);
    if (ownerId !== userId) {
      return forbidden(c, "This org is still pending approval");
    }
    return c.json({ org: orgPayload(org), members: [] });
  }

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

  return c.json({ org: orgPayload(org), members });
});

/* ------------------------------------------------------------------ PATCH /v1/orgs/:slug */
/* Founder-only edits to the pending-org form. Slug is fixed at first submit; */
/* only founder_email and founder_name are editable.                          */

orgs.patch("/:slug", requireAuth, async (c) => {
  const userId = c.var.userId;
  const slug = c.req.param("slug");

  let body: ReturnType<typeof PatchOrgRequestSchema.parse>;
  try {
    const raw: unknown = await c.req.json();
    body = PatchOrgRequestSchema.parse(raw);
  } catch (e) {
    return validationError(c, e instanceof Error ? e.message : e);
  }

  const org = await getOrgBySlug(c.env.DB, slug);
  if (!org) return notFound(c, "Org not found");

  if (org.status !== "pending") {
    return forbidden(c, "Cannot edit an approved org via this endpoint");
  }

  const ownerId = await getOwnerId(c.env.DB, org.id);
  if (ownerId !== userId) return forbidden(c, "Only the founder can edit a pending org");

  const updates: string[] = [];
  const binds: unknown[] = [];
  if (body.founderEmail !== undefined) {
    updates.push("founder_email = ?");
    binds.push(body.founderEmail);
  }
  if (body.founderName !== undefined) {
    updates.push("founder_name = ?");
    binds.push(body.founderName);
  }

  if (updates.length === 0) {
    return c.json({ org: orgPayload(org) });
  }

  binds.push(org.id);
  await c.env.DB.prepare(`UPDATE orgs SET ${updates.join(", ")} WHERE id = ?`)
    .bind(...binds)
    .run();

  const refreshed = await getOrgBySlug(c.env.DB, slug);
  if (!refreshed) return notFound(c, "Org not found");
  return c.json({ org: orgPayload(refreshed) });
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

  if (org.status !== "approved") {
    return forbidden(c, "Cannot send invites for a pending org");
  }

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

  if (org.status !== "approved") {
    return forbidden(c, "Cannot accept invites for a pending org");
  }

  const user = await c.env.DB.prepare("SELECT id, handle FROM users WHERE id = ?")
    .bind(userId)
    .first<{ id: string; handle: string }>();

  if (!user) return notFound(c, "User not found");

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

  if (org.status !== "approved") {
    return forbidden(c, "Dashboard is unavailable until the org is approved");
  }

  const role = await getMembership(c.env.DB, org.id, userId);
  if (!role) return forbidden(c, "You are not a member of this org");

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - MONTH_MS).toISOString().slice(0, 10);

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
    .bind(org.id, now.getTime() - MONTH_MS)
    .all<{
      model: string;
      tokens: number;
      cost_usd_cents: number;
    }>();

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
