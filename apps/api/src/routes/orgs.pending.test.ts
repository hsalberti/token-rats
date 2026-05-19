/**
 * Unit tests for v1.2 Track AA — soft-create org flow.
 *
 * Exercises the orgs + admin route handlers end-to-end through Hono with an
 * in-memory D1 stub. The stub only implements the SQL shapes these tests
 * touch — it is *not* a general SQLite emulator.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import orgsRoutes from "./orgs.js";
import adminRoutes from "./admin.js";
import type { Env } from "../env.js";
import type { AuthVariables } from "../middleware/auth.js";

/* -------------------------------------------------------------------------- */
/* In-memory D1 stub                                                           */
/* -------------------------------------------------------------------------- */

type OrgRow = {
  id: string;
  name: string;
  slug: string | null;
  plan: string;
  seat_count: number;
  github_org_login: string | null;
  created_at: number;
  status: string;
  stripe_customer_id: string | null;
};

type UserRow = { id: string; handle: string; email: string | null };
type OrgMemberRow = { org_id: string; user_id: string; role: string };
type WaitlistRow = {
  id: string;
  topic: string;
  email: string;
  github_login: string | null;
  payload_json: string | null;
  created_at: number;
};

interface Store {
  orgs: OrgRow[];
  users: UserRow[];
  orgMembers: OrgMemberRow[];
  waitlists: WaitlistRow[];
}

function newStore(): Store {
  return { orgs: [], users: [], orgMembers: [], waitlists: [] };
}

/** Build a D1Database-shaped stub backed by `store`. Implements only the
 *  SQL shapes used by orgs.ts + admin.ts; new SQL means new branches here. */
function makeDb(store: Store): D1Database {
  function exec(sql: string, params: unknown[]) {
    const trimmed = sql.replace(/\s+/g, " ").trim();

    // SELECT users by id
    if (/^SELECT handle, email FROM users WHERE id = \?$/.test(trimmed)) {
      const row = store.users.find((u) => u.id === params[0]);
      return { first: row ?? null, all: row ? [row] : [], changes: 0 };
    }
    if (/^SELECT handle FROM users WHERE id = \?$/.test(trimmed)) {
      const row = store.users.find((u) => u.id === params[0]);
      return { first: row ? { handle: row.handle } : null, all: [], changes: 0 };
    }
    if (/^SELECT id, handle FROM users WHERE id = \?$/.test(trimmed)) {
      const row = store.users.find((u) => u.id === params[0]);
      return { first: row ?? null, all: [], changes: 0 };
    }

    // SELECT orgs by slug (full row, with status)
    if (
      /^SELECT id, name, slug, plan, seat_count, github_org_login, created_at, status FROM orgs WHERE slug = \?$/.test(
        trimmed,
      )
    ) {
      const row = store.orgs.find((o) => o.slug === params[0]);
      return { first: row ?? null, all: [], changes: 0 };
    }

    // SELECT id, status FROM orgs WHERE slug
    if (/^SELECT id, status FROM orgs WHERE slug = \?$/.test(trimmed)) {
      const row = store.orgs.find((o) => o.slug === params[0]);
      return {
        first: row ? { id: row.id, status: row.status } : null,
        all: [],
        changes: 0,
      };
    }

    // SELECT id, name, ... by id
    if (
      /^SELECT id, name, slug, plan, seat_count, github_org_login, created_at, status FROM orgs WHERE id = \?$/.test(
        trimmed,
      )
    ) {
      const row = store.orgs.find((o) => o.id === params[0]);
      return { first: row ?? null, all: [], changes: 0 };
    }

    // INSERT orgs
    if (/^INSERT INTO orgs \(/.test(trimmed)) {
      const [id, name, slug, plan, githubOrg, createdAt] = params as [
        string,
        string,
        string,
        string,
        string | null,
        number,
      ];
      store.orgs.push({
        id,
        name,
        slug,
        plan,
        seat_count: 0,
        github_org_login: githubOrg,
        created_at: createdAt,
        status: "pending",
        stripe_customer_id: null,
      });
      return { first: null, all: [], changes: 1 };
    }

    // INSERT org_members
    if (/^INSERT INTO org_members \(/.test(trimmed)) {
      // Production SQL hardcodes role='owner' as a literal, so only 2 params arrive.
      const [orgId, userId] = params as [string, string];
      const literalRoleMatch = trimmed.match(/VALUES\s*\([^)]*'(owner|admin|member)'\s*\)/);
      const role = literalRoleMatch ? literalRoleMatch[1]! : (params[2] as string);
      store.orgMembers.push({ org_id: orgId, user_id: userId, role });
      return { first: null, all: [], changes: 1 };
    }

    // SELECT role from org_members
    if (/^SELECT role FROM org_members WHERE org_id = \? AND user_id = \?$/.test(trimmed)) {
      const row = store.orgMembers.find(
        (m) => m.org_id === params[0] && m.user_id === params[1],
      );
      return { first: row ? { role: row.role } : null, all: [], changes: 0 };
    }

    // INSERT waitlists with ON CONFLICT DO NOTHING
    if (/^INSERT INTO waitlists \(/.test(trimmed)) {
      const [id, topic, email, githubLogin, payloadJson, createdAt] = params as [
        string,
        string,
        string,
        string | null,
        string | null,
        number,
      ];
      const exists = store.waitlists.some(
        (w) => w.topic === topic && w.email === email,
      );
      if (exists) return { first: null, all: [], changes: 0 };
      store.waitlists.push({
        id,
        topic,
        email,
        github_login: githubLogin,
        payload_json: payloadJson,
        created_at: createdAt,
      });
      return { first: null, all: [], changes: 1 };
    }

    // Waitlist position query
    if (
      /SELECT COUNT\(\*\) AS pos FROM waitlists\s+WHERE topic = 'orgs' AND created_at <=/.test(
        trimmed,
      )
    ) {
      const email = params[0] as string;
      const target = store.waitlists.find((w) => w.topic === "orgs" && w.email === email);
      if (!target) return { first: { pos: 0 }, all: [], changes: 0 };
      const pos = store.waitlists.filter(
        (w) => w.topic === "orgs" && w.created_at <= target.created_at,
      ).length;
      return { first: { pos }, all: [], changes: 0 };
    }
    if (
      /SELECT COUNT\(\*\) AS pos FROM waitlists\s+WHERE topic = \? AND created_at <=/.test(trimmed)
    ) {
      const [topic, _topic2, email] = params as [string, string, string];
      const target = store.waitlists.find((w) => w.topic === topic && w.email === email);
      if (!target) return { first: { pos: 0 }, all: [], changes: 0 };
      const pos = store.waitlists.filter(
        (w) => w.topic === topic && w.created_at <= target.created_at,
      ).length;
      return { first: { pos }, all: [], changes: 0 };
    }

    // SELECT members + handles (org GET)
    if (/^SELECT om\.user_id, om\.role, u\.handle, u\.avatar_url/.test(trimmed)) {
      const orgId = params[0] as string;
      const results = store.orgMembers
        .filter((m) => m.org_id === orgId)
        .map((m) => {
          const u = store.users.find((x) => x.id === m.user_id);
          return {
            user_id: m.user_id,
            role: m.role,
            handle: u?.handle ?? "",
            avatar_url: null,
          };
        });
      return { first: results[0] ?? null, all: results, changes: 0 };
    }

    // Admin: list pending orgs with founder JOIN
    if (/^SELECT o\.id, o\.name, o\.slug, o\.plan/.test(trimmed) && /WHERE o\.status = 'pending'/.test(trimmed)) {
      const limit = params[0] as number;
      const offset = params[1] as number;
      const rows = store.orgs
        .filter((o) => o.status === "pending")
        .sort((a, b) => b.created_at - a.created_at)
        .slice(offset, offset + limit)
        .map((o) => {
          const owner = store.orgMembers.find(
            (m) => m.org_id === o.id && m.role === "owner",
          );
          const u = owner ? store.users.find((x) => x.id === owner.user_id) : undefined;
          const w = u
            ? store.waitlists.find((x) => x.topic === "orgs" && x.github_login === u.handle)
            : undefined;
          return {
            id: o.id,
            name: o.name,
            slug: o.slug,
            plan: o.plan,
            seat_count: o.seat_count,
            github_org_login: o.github_org_login,
            created_at: o.created_at,
            status: o.status,
            founder_handle: u?.handle ?? null,
            payload_json: w?.payload_json ?? null,
            waitlist_created_at: w?.created_at ?? null,
          };
        });
      return { first: rows[0] ?? null, all: rows, changes: 0 };
    }

    // Admin: list waitlists for a topic
    if (
      /^SELECT id, topic, email, github_login, payload_json, created_at FROM waitlists WHERE topic = \?/.test(
        trimmed,
      )
    ) {
      const topic = params[0] as string;
      const limit = params[1] as number;
      const offset = params[2] as number;
      const rows = store.waitlists
        .filter((w) => w.topic === topic)
        .sort((a, b) => b.created_at - a.created_at)
        .slice(offset, offset + limit);
      return { first: rows[0] ?? null, all: rows, changes: 0 };
    }
    if (/^SELECT COUNT\(\*\) AS total FROM waitlists WHERE topic = \?$/.test(trimmed)) {
      const topic = params[0] as string;
      const total = store.waitlists.filter((w) => w.topic === topic).length;
      return { first: { total }, all: [], changes: 0 };
    }

    // UPDATE orgs SET status='active', plan=?
    if (/^UPDATE orgs SET status = 'active', plan = \? WHERE id = \?$/.test(trimmed)) {
      const [plan, id] = params as [string, string];
      const o = store.orgs.find((x) => x.id === id);
      if (o) {
        o.status = "active";
        o.plan = plan;
      }
      return { first: null, all: [], changes: o ? 1 : 0 };
    }

    throw new Error(`Unmocked SQL: ${trimmed}`);
  }

  function makeStmt(sql: string, boundParams: unknown[] = []): D1PreparedStatement {
    const stmt = {
      bind(...args: unknown[]) {
        return makeStmt(sql, args);
      },
      async first<T>() {
        const r = exec(sql, boundParams);
        return r.first as T;
      },
      async all<T>() {
        const r = exec(sql, boundParams);
        return { results: r.all as T[], success: true, meta: { changes: r.changes } };
      },
      async run() {
        const r = exec(sql, boundParams);
        return { success: true, meta: { changes: r.changes } };
      },
      async raw() {
        return [];
      },
    };
    return stmt as unknown as D1PreparedStatement;
  }

  const db = {
    prepare(sql: string) {
      return makeStmt(sql);
    },
    async batch(statements: D1PreparedStatement[]) {
      const results = [];
      for (const s of statements) {
        results.push(await s.run());
      }
      return results;
    },
  };

  return db as unknown as D1Database;
}

/* -------------------------------------------------------------------------- */
/* Test harness                                                                */
/* -------------------------------------------------------------------------- */

function makeApp(store: Store, adminHandles?: string) {
  type HonoEnv = { Bindings: Env; Variables: AuthVariables };
  const app = new Hono<HonoEnv>();
  // Skip auth in tests — inject userId from a header.
  app.use("*", async (c, next) => {
    const userId = c.req.header("x-test-user-id");
    if (userId) c.set("userId", userId);
    await next();
  });
  app.route("/v1/orgs", orgsRoutes);
  app.route("/v1/admin", adminRoutes);

  const env = {
    DB: makeDb(store),
    ADMIN_HANDLES: adminHandles,
  } as unknown as Env;

  return async (path: string, init: RequestInit & { userId?: string } = {}) => {
    const headers = new Headers(init.headers);
    if (init.userId) headers.set("x-test-user-id", init.userId);
    // The middleware/auth.ts requireAuth gate fires *before* our test-injector
    // because routes/orgs.ts uses requireAuth inside the route. We bypass it
    // by also setting a fake cookie that requireAuth won't actually validate
    // — wait, requireAuth *does* validate. We need a different approach.
    return app.fetch(new Request(`http://test${path}`, { ...init, headers }), env);
  };
}

/* -------------------------------------------------------------------------- */
/* Bypassing requireAuth                                                       */
/* -------------------------------------------------------------------------- */

// The simplest way to get past requireAuth without forging an HMAC is to
// monkey-patch the auth middleware module. Easier: each route calls
// `requireAuth` which reads `c.var.userId` from `extractUserId`. We can't
// override that from outside, so instead we mint a valid token using the
// same signing key the env passes.

import { signToken } from "../lib/auth.js";

async function authCookie(userId: string, signingKey: string): Promise<string> {
  const token = await signToken(userId, signingKey, 60_000);
  return `tr_session=${token}`;
}

const TEST_SIGNING_KEY = "test-signing-key-for-orgs-pending-tests";

function makeAppWithAuth(store: Store, adminHandles?: string) {
  type HonoEnv = { Bindings: Env; Variables: AuthVariables };
  const app = new Hono<HonoEnv>();
  app.route("/v1/orgs", orgsRoutes);
  app.route("/v1/admin", adminRoutes);

  const env = {
    DB: makeDb(store),
    SESSION_SIGNING_KEY: TEST_SIGNING_KEY,
    ADMIN_HANDLES: adminHandles,
    CACHE: undefined,
  } as unknown as Env;

  return async (
    path: string,
    init: RequestInit & { userId?: string } = {},
  ): Promise<Response> => {
    const headers = new Headers(init.headers);
    if (init.userId) {
      headers.set("Cookie", await authCookie(init.userId, TEST_SIGNING_KEY));
    }
    return app.fetch(new Request(`http://test${path}`, { ...init, headers }), env);
  };
}

/* -------------------------------------------------------------------------- */
/* Tests                                                                       */
/* -------------------------------------------------------------------------- */

describe("v1.2 Track AA — soft-create org flow", () => {
  let store: Store;
  let fetcher: ReturnType<typeof makeAppWithAuth>;

  beforeEach(() => {
    store = newStore();
    store.users.push({ id: "user-1", handle: "founder", email: "founder@example.com" });
    store.users.push({ id: "user-2", handle: "stranger", email: "stranger@example.com" });
    store.users.push({ id: "user-admin", handle: "tokenrats-admin", email: "admin@example.com" });
    fetcher = makeAppWithAuth(store);
  });

  it("creates an org with status='pending' and returns waitlistPosition", async () => {
    const res = await fetcher("/v1/orgs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Acme", slug: "acme" }),
      userId: "user-1",
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      org: { status: string; plan: string; slug: string };
      waitlistPosition: number;
    };
    expect(body.org.status).toBe("pending");
    expect(body.org.plan).toBe("free");
    expect(body.org.slug).toBe("acme");
    expect(body.waitlistPosition).toBe(1);

    // Side effects: org row, owner membership, waitlist row all written.
    expect(store.orgs).toHaveLength(1);
    expect(store.orgMembers).toHaveLength(1);
    expect(store.orgMembers[0]?.role).toBe("owner");
    expect(store.waitlists).toHaveLength(1);
    expect(store.waitlists[0]?.topic).toBe("orgs");
    expect(store.waitlists[0]?.email).toBe("founder@example.com");
  });

  it("flags plan='student' when student=true and persists university to payload", async () => {
    const res = await fetcher("/v1/orgs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "MIT Builders",
        slug: "mit-builders",
        student: true,
        university: "MIT",
        note: "spring cohort",
      }),
      userId: "user-1",
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { org: { plan: string } };
    expect(body.org.plan).toBe("student");

    expect(store.waitlists).toHaveLength(1);
    const payload = JSON.parse(store.waitlists[0]?.payload_json ?? "{}");
    expect(payload.university).toBe("MIT");
    expect(payload.note).toBe("spring cohort");
    expect(payload.plan).toBe("student");
  });

  it("founder can GET their pending org; non-founder gets 404", async () => {
    await fetcher("/v1/orgs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Acme", slug: "acme" }),
      userId: "user-1",
    });

    const founderView = await fetcher("/v1/orgs/acme", { userId: "user-1" });
    expect(founderView.status).toBe(200);
    const founderBody = (await founderView.json()) as { org: { status: string } };
    expect(founderBody.org.status).toBe("pending");

    const strangerView = await fetcher("/v1/orgs/acme", { userId: "user-2" });
    expect(strangerView.status).toBe(404);
  });

  it("re-submitting the same slug as the same founder is idempotent", async () => {
    const first = await fetcher("/v1/orgs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Acme", slug: "acme" }),
      userId: "user-1",
    });
    const firstBody = (await first.json()) as { waitlistPosition: number };

    const second = await fetcher("/v1/orgs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Acme Renamed", slug: "acme" }),
      userId: "user-1",
    });
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as {
      org: { slug: string };
      waitlistPosition: number;
    };
    expect(secondBody.org.slug).toBe("acme");
    // Position should be the original one, not a new row.
    expect(secondBody.waitlistPosition).toBe(firstBody.waitlistPosition);
    // No duplicate org row.
    expect(store.orgs).toHaveLength(1);
    // No duplicate waitlist row.
    expect(store.waitlists).toHaveLength(1);
  });

  it("admin can approve a pending org and flips it to active", async () => {
    const adminFetcher = makeAppWithAuth(store, "tokenrats-admin");
    // Re-seed using the same store reference.
    await fetcher("/v1/orgs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Acme", slug: "acme" }),
      userId: "user-1",
    });

    const approve = await adminFetcher("/v1/admin/orgs/acme/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "",
      userId: "user-admin",
    });
    expect(approve.status).toBe(200);
    const approveBody = (await approve.json()) as { org: { status: string; plan: string } };
    expect(approveBody.org.status).toBe("active");

    expect(store.orgs[0]?.status).toBe("active");
  });

  it("admin can override plan at approve time", async () => {
    const adminFetcher = makeAppWithAuth(store, "tokenrats-admin");
    await fetcher("/v1/orgs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "MIT", slug: "mit", student: true, university: "MIT" }),
      userId: "user-1",
    });

    const approve = await adminFetcher("/v1/admin/orgs/mit/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: "student" }),
      userId: "user-admin",
    });
    expect(approve.status).toBe(200);
    const body = (await approve.json()) as { org: { plan: string; status: string } };
    expect(body.org.plan).toBe("student");
    expect(body.org.status).toBe("active");
  });

  it("non-admin caller is rejected from admin endpoints", async () => {
    const res = await fetcher("/v1/admin/orgs/pending", { userId: "user-1" });
    expect(res.status).toBe(403);
  });

  it("admin pending list returns the queued org with founder handle", async () => {
    const adminFetcher = makeAppWithAuth(store, "tokenrats-admin");
    await fetcher("/v1/orgs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Acme", slug: "acme", note: "hi" }),
      userId: "user-1",
    });

    const list = await adminFetcher("/v1/admin/orgs/pending", { userId: "user-admin" });
    expect(list.status).toBe(200);
    const body = (await list.json()) as {
      pending: Array<{ org: { slug: string }; founderHandle: string; note: string | null }>;
    };
    expect(body.pending).toHaveLength(1);
    expect(body.pending[0]?.org.slug).toBe("acme");
    expect(body.pending[0]?.founderHandle).toBe("founder");
    expect(body.pending[0]?.note).toBe("hi");
  });
});
