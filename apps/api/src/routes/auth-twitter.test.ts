/**
 * Unit tests for v1.2 Track AC — Twitter/X OAuth (PKCE) routes.
 *
 * Drives the Hono app with an in-memory D1 stub and a stubbed KV namespace.
 * `fetch` is mocked at the module level so the tests don't hit twitter.com.
 */

import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../env.js";
import { signToken } from "../lib/auth.js";
import type { AuthVariables } from "../middleware/auth.js";
import twitterAuthRoutes from "./auth-twitter.js";

/* -------------------------------------------------------------------------- */
/* Stubs                                                                       */
/* -------------------------------------------------------------------------- */

type UserRow = {
  id: string;
  handle: string;
  twitter_user_id: string | null;
  twitter_handle: string | null;
  twitter_verified_at: number | null;
};

interface Store {
  users: UserRow[];
}

function newStore(): Store {
  return { users: [] };
}

function makeDb(store: Store): D1Database {
  function exec(sql: string, params: unknown[]) {
    const trimmed = sql.replace(/\s+/g, " ").trim();

    if (
      /^UPDATE users\s+SET twitter_user_id = \?, twitter_handle = \?, twitter_verified_at = \?\s+WHERE id = \?$/.test(
        trimmed,
      )
    ) {
      const [twId, twHandle, ts, userId] = params as [string, string, number, string];
      const u = store.users.find((x) => x.id === userId);
      if (u) {
        u.twitter_user_id = twId;
        u.twitter_handle = twHandle;
        u.twitter_verified_at = ts;
      }
      return { first: null, all: [], changes: u ? 1 : 0 };
    }

    if (
      /^UPDATE users\s+SET twitter_user_id = NULL, twitter_handle = NULL, twitter_verified_at = NULL\s+WHERE id = \?$/.test(
        trimmed,
      )
    ) {
      const [userId] = params as [string];
      const u = store.users.find((x) => x.id === userId);
      if (u) {
        u.twitter_user_id = null;
        u.twitter_handle = null;
        u.twitter_verified_at = null;
      }
      return { first: null, all: [], changes: u ? 1 : 0 };
    }

    throw new Error(`Unmocked SQL: ${trimmed}`);
  }

  function makeStmt(sql: string, boundParams: unknown[] = []): D1PreparedStatement {
    const stmt = {
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
    };
    return stmt as unknown as D1PreparedStatement;
  }

  return {
    prepare(sql: string) {
      return makeStmt(sql);
    },
  } as unknown as D1Database;
}

interface KvStore {
  data: Map<string, string>;
}

function makeKv(kvStore: KvStore): KVNamespace {
  return {
    async get(key: string) {
      return kvStore.data.get(key) ?? null;
    },
    async put(key: string, value: string, _opts?: { expirationTtl?: number }) {
      kvStore.data.set(key, value);
    },
    async delete(key: string) {
      kvStore.data.delete(key);
    },
  } as unknown as KVNamespace;
}

/* -------------------------------------------------------------------------- */
/* Harness                                                                     */
/* -------------------------------------------------------------------------- */

const TEST_SIGNING_KEY = "test-signing-key-for-twitter-tests";

function makeApp(store: Store, kvStore: KvStore, withSecrets = true) {
  type HonoEnv = { Bindings: Env; Variables: AuthVariables };
  const app = new Hono<HonoEnv>();
  app.route("/v1", twitterAuthRoutes);

  const env = {
    DB: makeDb(store),
    CACHE: makeKv(kvStore),
    WEB_ORIGIN: "https://tokenrats.com",
    SESSION_SIGNING_KEY: TEST_SIGNING_KEY,
    ...(withSecrets
      ? {
          X_OAUTH_CLIENT_ID: "test-client-id",
          X_OAUTH_CLIENT_SECRET: "test-client-secret",
        }
      : {}),
  } as unknown as Env;

  return async (
    path: string,
    init: RequestInit & { userId?: string; redirect?: "follow" | "error" | "manual" } = {},
  ) => {
    const headers = new Headers(init.headers);
    if (init.userId) {
      const token = await signToken(init.userId, TEST_SIGNING_KEY, 60_000);
      headers.set("Cookie", `tr_session=${token}`);
    }
    return app.fetch(
      new Request(`http://test${path}`, { ...init, headers, redirect: "manual" }),
      env,
    );
  };
}

/* -------------------------------------------------------------------------- */
/* Tests                                                                       */
/* -------------------------------------------------------------------------- */

describe("v1.2 Track AC — /v1/auth/twitter/*", () => {
  let store: Store;
  let kvStore: KvStore;
  let fetcher: ReturnType<typeof makeApp>;
  let originalFetch: typeof fetch;

  beforeEach(() => {
    store = newStore();
    kvStore = { data: new Map() };
    store.users.push({
      id: "user-1",
      handle: "vibedev",
      twitter_user_id: null,
      twitter_handle: null,
      twitter_verified_at: null,
    });
    fetcher = makeApp(store, kvStore);
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("start stores a PKCE record in KV and redirects to twitter.com", async () => {
    const res = await fetcher("/v1/auth/twitter/start", { userId: "user-1" });
    expect(res.status).toBe(302);
    const location = res.headers.get("location") ?? "";
    expect(location.startsWith("https://twitter.com/i/oauth2/authorize?")).toBe(true);

    // PKCE record persisted under the per-user key
    const raw = kvStore.data.get("tw_pkce:user-1");
    expect(raw).toBeTruthy();
    const stored = JSON.parse(raw ?? "{}") as { verifier: string; state: string };
    expect(stored.verifier).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(stored.state).toMatch(/^[A-Za-z0-9_-]{16,}$/);

    // The redirect URL carries the matching state and a SHA-256 (S256) challenge
    const url = new URL(location);
    expect(url.searchParams.get("state")).toBe(stored.state);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("client_id")).toBe("test-client-id");
    expect(url.searchParams.get("scope")).toBe("tweet.read users.read");
  });

  it("start returns 503 when X_OAUTH secrets are not configured", async () => {
    const f = makeApp(store, kvStore, false);
    const res = await f("/v1/auth/twitter/start", { userId: "user-1" });
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("not_configured");
  });

  it("start requires auth", async () => {
    const res = await fetcher("/v1/auth/twitter/start");
    expect(res.status).toBe(401);
  });

  it("callback exchanges code, upserts user, and redirects to settings on success", async () => {
    // Seed the PKCE record as if start ran.
    kvStore.data.set(
      "tw_pkce:user-1",
      JSON.stringify({ verifier: "verifier-abc", state: "state-xyz" }),
    );

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "https://api.twitter.com/2/oauth2/token") {
        return new Response(JSON.stringify({ access_token: "tok-123" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.startsWith("https://api.twitter.com/2/users/me")) {
        return new Response(JSON.stringify({ data: { id: "9999", username: "real_handle" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const res = await fetcher("/v1/auth/twitter/callback?code=abc&state=state-xyz", {
      userId: "user-1",
    });

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "https://tokenrats.com/settings/profile?twitter=connected",
    );

    // PKCE record consumed
    expect(kvStore.data.has("tw_pkce:user-1")).toBe(false);

    // User row updated
    const u = store.users[0];
    expect(u?.twitter_user_id).toBe("9999");
    expect(u?.twitter_handle).toBe("real_handle");
    expect(u?.twitter_verified_at).toBeTypeOf("number");

    // Token request used Basic auth
    const tokenCall = fetchMock.mock.calls.find(
      (c) =>
        (typeof c[0] === "string" ? c[0] : (c[0] as { toString(): string }).toString()) ===
        "https://api.twitter.com/2/oauth2/token",
    ) as unknown as [string, RequestInit] | undefined;
    const tokenInit = tokenCall?.[1] as RequestInit;
    expect(tokenInit.method).toBe("POST");
    const authHeader = new Headers(tokenInit.headers).get("Authorization");
    expect(authHeader?.startsWith("Basic ")).toBe(true);
  });

  it("callback redirects to ?twitter=failed when state does not match", async () => {
    kvStore.data.set("tw_pkce:user-1", JSON.stringify({ verifier: "v", state: "state-good" }));

    const res = await fetcher("/v1/auth/twitter/callback?code=abc&state=state-bad", {
      userId: "user-1",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "https://tokenrats.com/settings/profile?twitter=failed",
    );
    // User unchanged
    expect(store.users[0]?.twitter_user_id).toBeNull();
  });

  it("callback redirects to failed when there is no PKCE record", async () => {
    const res = await fetcher("/v1/auth/twitter/callback?code=abc&state=anything", {
      userId: "user-1",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "https://tokenrats.com/settings/profile?twitter=failed",
    );
  });

  it("callback redirects to failed when the token exchange returns non-ok", async () => {
    kvStore.data.set("tw_pkce:user-1", JSON.stringify({ verifier: "v", state: "s" }));

    globalThis.fetch = (async () =>
      new Response("err", { status: 400 })) as unknown as typeof fetch;

    const res = await fetcher("/v1/auth/twitter/callback?code=abc&state=s", { userId: "user-1" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "https://tokenrats.com/settings/profile?twitter=failed",
    );
    expect(store.users[0]?.twitter_user_id).toBeNull();
  });

  it("disconnect nulls the three columns", async () => {
    store.users[0] = {
      id: "user-1",
      handle: "vibedev",
      twitter_user_id: "9999",
      twitter_handle: "real_handle",
      twitter_verified_at: 1_700_000_000_000,
    };

    const res = await fetcher("/v1/me/twitter/disconnect", {
      method: "POST",
      userId: "user-1",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);

    const u = store.users[0];
    expect(u?.twitter_user_id).toBeNull();
    expect(u?.twitter_handle).toBeNull();
    expect(u?.twitter_verified_at).toBeNull();
  });

  it("disconnect is idempotent on an unconnected user", async () => {
    const res = await fetcher("/v1/me/twitter/disconnect", {
      method: "POST",
      userId: "user-1",
    });
    expect(res.status).toBe(200);
  });
});
