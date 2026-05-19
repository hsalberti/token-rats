/**
 * Unit tests for v1.2 Track AA — public POST /v1/waitlists + admin list.
 *
 * Stubs both D1 (waitlists table) and KV (rate limiter).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import waitlistsRoutes from "./waitlists.js";
import adminRoutes from "./admin.js";
import type { Env } from "../env.js";
import type { AuthVariables } from "../middleware/auth.js";
import { signToken } from "../lib/auth.js";

/* -------------------------------------------------------------------------- */
/* In-memory stores                                                            */
/* -------------------------------------------------------------------------- */

type WaitlistRow = {
  id: string;
  topic: string;
  email: string;
  github_login: string | null;
  payload_json: string | null;
  created_at: number;
};

interface Store {
  waitlists: WaitlistRow[];
  users: Array<{ id: string; handle: string; email: string | null }>;
}

function newStore(): Store {
  return { waitlists: [], users: [] };
}

class MockKV {
  store = new Map<string, string>();
  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }
  async put(key: string, value: string, _opts?: { expirationTtl?: number }): Promise<void> {
    this.store.set(key, value);
  }
  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}

function makeDb(store: Store): D1Database {
  function exec(sql: string, params: unknown[]) {
    const trimmed = sql.replace(/\s+/g, " ").trim();

    if (/^SELECT handle FROM users WHERE id = \?$/.test(trimmed)) {
      const u = store.users.find((x) => x.id === params[0]);
      return { first: u ? { handle: u.handle } : null, all: [], changes: 0 };
    }

    if (/^INSERT INTO waitlists \(/.test(trimmed)) {
      const [id, topic, email, githubLogin, payloadJson, createdAt] = params as [
        string,
        string,
        string,
        string | null,
        string | null,
        number,
      ];
      const exists = store.waitlists.some((w) => w.topic === topic && w.email === email);
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
      return {
        first: { total: store.waitlists.filter((w) => w.topic === topic).length },
        all: [],
        changes: 0,
      };
    }

    throw new Error(`Unmocked SQL: ${trimmed}`);
  }

  function makeStmt(sql: string, boundParams: unknown[] = []): D1PreparedStatement {
    return {
      bind(...args: unknown[]) {
        return makeStmt(sql, args);
      },
      async first<T>() {
        return exec(sql, boundParams).first as T;
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
    } as unknown as D1PreparedStatement;
  }

  return {
    prepare(sql: string) {
      return makeStmt(sql);
    },
    async batch(statements: D1PreparedStatement[]) {
      const r = [];
      for (const s of statements) r.push(await s.run());
      return r;
    },
  } as unknown as D1Database;
}

const TEST_SIGNING_KEY = "test-signing-key-for-waitlists-tests";

function makeApp(store: Store, kv: MockKV, adminHandles?: string) {
  type HonoEnv = { Bindings: Env; Variables: AuthVariables };
  const app = new Hono<HonoEnv>();
  app.route("/v1/waitlists", waitlistsRoutes);
  app.route("/v1/admin", adminRoutes);

  const env = {
    DB: makeDb(store),
    CACHE: kv as unknown as KVNamespace,
    SESSION_SIGNING_KEY: TEST_SIGNING_KEY,
    ADMIN_HANDLES: adminHandles,
  } as unknown as Env;

  return async (
    path: string,
    init: RequestInit & { userId?: string; ip?: string } = {},
  ): Promise<Response> => {
    const headers = new Headers(init.headers);
    if (init.userId) {
      const token = await signToken(init.userId, TEST_SIGNING_KEY, 60_000);
      headers.set("Cookie", `tr_session=${token}`);
    }
    if (init.ip) headers.set("cf-connecting-ip", init.ip);
    return app.fetch(new Request(`http://test${path}`, { ...init, headers }), env);
  };
}

/* -------------------------------------------------------------------------- */
/* Tests                                                                       */
/* -------------------------------------------------------------------------- */

describe("v1.2 Track AA — POST /v1/waitlists", () => {
  let store: Store;
  let kv: MockKV;
  let fetcher: ReturnType<typeof makeApp>;

  beforeEach(() => {
    store = newStore();
    kv = new MockKV();
    fetcher = makeApp(store, kv);
  });

  it("inserts a new waitlist row and returns position=1", async () => {
    const res = await fetcher("/v1/waitlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: "provider:vscode",
        email: "alice@example.com",
        note: "want this",
      }),
      ip: "1.2.3.4",
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { ok: true; position: number };
    expect(body.ok).toBe(true);
    expect(body.position).toBe(1);

    expect(store.waitlists).toHaveLength(1);
    expect(store.waitlists[0]?.topic).toBe("provider:vscode");
    expect(store.waitlists[0]?.email).toBe("alice@example.com");
    const payload = JSON.parse(store.waitlists[0]?.payload_json ?? "{}");
    expect(payload.note).toBe("want this");
  });

  it("is idempotent on (topic, email) — second submit returns the same position", async () => {
    await fetcher("/v1/waitlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic: "orgs", email: "bob@example.com" }),
      ip: "1.2.3.4",
    });
    const second = await fetcher("/v1/waitlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic: "orgs", email: "bob@example.com" }),
      ip: "1.2.3.4",
    });
    const body = (await second.json()) as { ok: true; position: number };
    expect(body.position).toBe(1);
    expect(store.waitlists).toHaveLength(1);
  });

  it("rate-limits at 10 requests per IP per day", async () => {
    for (let i = 0; i < 10; i++) {
      const r = await fetcher("/v1/waitlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: "orgs", email: `user${i}@example.com` }),
        ip: "10.0.0.1",
      });
      expect(r.status).toBe(201);
    }
    const blocked = await fetcher("/v1/waitlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic: "orgs", email: "user11@example.com" }),
      ip: "10.0.0.1",
    });
    expect(blocked.status).toBe(429);
  });

  it("rejects an invalid topic", async () => {
    const r = await fetcher("/v1/waitlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic: "marketing", email: "x@y.com" }),
      ip: "1.2.3.4",
    });
    expect(r.status).toBe(400);
  });

  it("admin can list waitlist entries for a topic", async () => {
    await fetcher("/v1/waitlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic: "provider:gemini-cli", email: "a@b.com", note: "yes" }),
      ip: "1.2.3.4",
    });

    store.users.push({ id: "admin-1", handle: "tokenrats-admin", email: "admin@x.com" });
    const adminFetcher = makeApp(store, kv, "tokenrats-admin");

    const list = await adminFetcher("/v1/admin/waitlists?topic=provider:gemini-cli", {
      userId: "admin-1",
    });
    expect(list.status).toBe(200);
    const body = (await list.json()) as {
      entries: Array<{ email: string; note: string | null }>;
      total: number;
    };
    expect(body.total).toBe(1);
    expect(body.entries[0]?.email).toBe("a@b.com");
    expect(body.entries[0]?.note).toBe("yes");
  });
});
