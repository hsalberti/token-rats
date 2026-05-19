/**
 * Admin routes — v1.2 Track AA
 *
 *  GET  /v1/admin/orgs/pending      – paginated queue of pending orgs (newest-first).
 *  POST /v1/admin/orgs/:slug/approve – flip status='pending' → 'active', optionally lock plan.
 *  GET  /v1/admin/waitlists?topic=  – paginated waitlist rows for a topic (newest-first).
 *
 * Admin gate: caller's GitHub `handle` must appear in the `ADMIN_HANDLES`
 * comma-separated allow-list (set via wrangler vars or `.dev.vars`). There's
 * no admin pattern elsewhere in the codebase yet (see `routes/abuse.ts`), so
 * this is the bootstrap surface — keep it tight.
 *
 * Local dev: add `ADMIN_HANDLES = "your-github-handle"` to `apps/api/.dev.vars`.
 * Prod: `wrangler vars put ADMIN_HANDLES "handle1,handle2"`.
 */

import { Hono } from "hono";
import { z } from "zod";
import { ApproveOrgRequest } from "@token-rats/contracts";
import type { Env } from "../env.js";
import type { AuthVariables } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";
import { forbidden, notFound, validationError } from "../lib/errors.js";

type HonoEnv = { Bindings: Env; Variables: AuthVariables };

const admin = new Hono<HonoEnv>();

/** Local-dev bootstrap so a fresh-clone contributor isn't locked out without
 *  setting an env var. Production deployments set `ADMIN_HANDLES` explicitly. */
const LOCAL_DEV_ADMIN_HANDLE = "tokenrats-admin";

function parseAdminHandles(raw: string | undefined): Set<string> {
  const list = (raw ?? LOCAL_DEV_ADMIN_HANDLE)
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return new Set(list);
}

/** Gate: the caller's `users.handle` (GitHub login) must be in ADMIN_HANDLES.
 *  Returns the caller's handle on success; null on rejection (caller already
 *  responded via the helper). */
async function requireAdmin(
  c: { env: Env; var: AuthVariables; json: (body: unknown, status: 403 | 404) => Response },
): Promise<string | null> {
  const userId = c.var.userId;
  const row = await c.env.DB.prepare("SELECT handle FROM users WHERE id = ?")
    .bind(userId)
    .first<{ handle: string }>();

  if (!row) {
    // Returning 404 instead of 403 here avoids leaking "you exist but aren't
    // an admin" vs "you don't exist" — both look the same to the client.
    return null;
  }

  const allow = parseAdminHandles(c.env.ADMIN_HANDLES);
  return allow.has(row.handle.toLowerCase()) ? row.handle : null;
}

/* ------------------------------------------------------------------ GET /v1/admin/orgs/pending */

admin.get("/orgs/pending", requireAuth, async (c) => {
  const handle = await requireAdmin(c);
  if (!handle) return forbidden(c, "Admin only");

  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
  const offset = Math.max(Number(c.req.query("offset") ?? 0), 0);

  const rows = await c.env.DB.prepare(
    `SELECT o.id, o.name, o.slug, o.plan, o.seat_count, o.github_org_login, o.created_at, o.status,
            u.handle AS founder_handle,
            w.payload_json AS payload_json,
            w.created_at  AS waitlist_created_at
     FROM orgs o
     LEFT JOIN org_members om ON om.org_id = o.id AND om.role = 'owner'
     LEFT JOIN users u ON u.id = om.user_id
     LEFT JOIN waitlists w ON w.topic = 'orgs' AND w.github_login = u.handle
     WHERE o.status = 'pending'
     ORDER BY o.created_at DESC
     LIMIT ? OFFSET ?`,
  )
    .bind(limit, offset)
    .all<{
      id: string;
      name: string;
      slug: string | null;
      plan: string;
      seat_count: number;
      github_org_login: string | null;
      created_at: number;
      status: string;
      founder_handle: string | null;
      payload_json: string | null;
      waitlist_created_at: number | null;
    }>();

  const pending = (rows.results ?? []).map((r) => {
    let university: string | null = null;
    let note: string | null = null;
    if (r.payload_json) {
      try {
        const parsed = JSON.parse(r.payload_json) as {
          university?: string;
          note?: string;
        };
        university = parsed.university ?? null;
        note = parsed.note ?? null;
      } catch {
        // Leave both null — the payload was written by us so a parse failure
        // here means a manual DB edit, not user input we need to recover.
      }
    }
    return {
      org: {
        id: r.id,
        name: r.name,
        slug: r.slug,
        plan: r.plan,
        seatCount: r.seat_count,
        githubOrgLogin: r.github_org_login,
        createdAt: r.created_at,
        status: "pending" as const,
      },
      founderHandle: r.founder_handle ?? "",
      university,
      note,
      createdAt: r.waitlist_created_at ?? r.created_at,
    };
  });

  return c.json({ pending });
});

/* ------------------------------------------------------------------ POST /v1/admin/orgs/:slug/approve */

admin.post("/orgs/:slug/approve", requireAuth, async (c) => {
  const handle = await requireAdmin(c);
  if (!handle) return forbidden(c, "Admin only");

  const slug = c.req.param("slug");

  // Body is optional; default to no plan override.
  let planOverride: "student" | "free" | "pro" | undefined;
  const rawText = await c.req.text();
  if (rawText.trim().length > 0) {
    try {
      const parsed = ApproveOrgRequest.parse(JSON.parse(rawText));
      planOverride = parsed.plan;
    } catch (e) {
      return validationError(c, e instanceof z.ZodError ? e.issues : String(e));
    }
  }

  const org = await c.env.DB.prepare(
    `SELECT id, name, slug, plan, seat_count, github_org_login, created_at, status
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
      status: string;
    }>();

  if (!org) return notFound(c, "Org not found");

  // Idempotent: already active = no-op, return the row as-is.
  if (org.status === "active" && !planOverride) {
    return c.json({
      org: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        plan: org.plan,
        seatCount: org.seat_count,
        githubOrgLogin: org.github_org_login,
        createdAt: org.created_at,
        status: "active" as const,
      },
    });
  }

  const finalPlan = planOverride ?? org.plan;

  await c.env.DB.prepare(
    `UPDATE orgs SET status = 'active', plan = ? WHERE id = ?`,
  )
    .bind(finalPlan, org.id)
    .run();

  return c.json({
    org: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      plan: finalPlan,
      seatCount: org.seat_count,
      githubOrgLogin: org.github_org_login,
      createdAt: org.created_at,
      status: "active" as const,
    },
  });
});

/* ------------------------------------------------------------------ GET /v1/admin/waitlists */

admin.get("/waitlists", requireAuth, async (c) => {
  const handle = await requireAdmin(c);
  if (!handle) return forbidden(c, "Admin only");

  const topic = c.req.query("topic");
  if (!topic) return validationError(c, "topic query param is required");

  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
  const offset = Math.max(Number(c.req.query("offset") ?? 0), 0);

  const rows = await c.env.DB.prepare(
    `SELECT id, topic, email, github_login, payload_json, created_at
     FROM waitlists
     WHERE topic = ?
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
  )
    .bind(topic, limit, offset)
    .all<{
      id: string;
      topic: string;
      email: string;
      github_login: string | null;
      payload_json: string | null;
      created_at: number;
    }>();

  const totalRow = await c.env.DB.prepare(
    "SELECT COUNT(*) AS total FROM waitlists WHERE topic = ?",
  )
    .bind(topic)
    .first<{ total: number }>();

  const entries = (rows.results ?? []).map((r) => {
    // Surface the free-text `note` if it exists in the payload. Other keys are
    // topic-specific and stay in payload_json for the admin to inspect.
    let note: string | null = null;
    if (r.payload_json) {
      try {
        const parsed = JSON.parse(r.payload_json) as { note?: string };
        note = parsed.note ?? null;
      } catch {
        note = null;
      }
    }
    return {
      id: r.id,
      topic: r.topic,
      email: r.email,
      githubLogin: r.github_login,
      note,
      createdAt: r.created_at,
    };
  });

  return c.json({ entries, total: totalRow?.total ?? 0 });
});

export default admin;
