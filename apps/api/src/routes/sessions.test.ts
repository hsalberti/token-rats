/**
 * Tests for POST /v1/sessions (CLI ingest).
 *
 * These cover the ingest-time guards that protect the rollup tables, mocking
 * D1/KV so no real database is needed:
 *   - A revoked device short-circuits with 401 BEFORE any priced upsert runs.
 *   - A malformed X-Device-Id is dropped (treated as no device), not trusted in SQL.
 *   - A multi-record batch prices off a single price-index load (no per-session N+1).
 *   - An empty `sessions` array is a heartbeat (accepted: 0) and bumps the device.
 */

import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../env.js";
import { signToken } from "../lib/auth.js";
import type { AuthVariables } from "../middleware/auth.js";
import sessionsRoutes from "./sessions.js";

const SIGNING_KEY = "test-sessions-signing-key-32-byte";
const TOKEN_TTL = 60 * 60;

/** A statement whose `first`/`all` results are chosen by matching the SQL. */
type SqlMatcher = (sql: string) => boolean;
interface D1Plan {
  firstFor: { match: SqlMatcher; value: Record<string, unknown> | null }[];
  preparedSql: string[];
  runs: { sql: string; args: unknown[] }[];
}

function makeD1(plan: D1Plan): D1Database {
  function resolveFirst(sql: string): Record<string, unknown> | null {
    const hit = plan.firstFor.find((f) => f.match(sql));
    return hit ? hit.value : null;
  }
  return {
    prepare: vi.fn((sql: string) => {
      plan.preparedSql.push(sql);
      let boundArgs: unknown[] = [];
      const stmt = {
        bind: vi.fn((...args: unknown[]) => {
          boundArgs = args;
          return stmt;
        }),
        first: vi.fn(() => Promise.resolve(resolveFirst(sql))),
        all: vi.fn(() => Promise.resolve({ results: [] })),
        run: vi.fn(() => {
          plan.runs.push({ sql, args: boundArgs });
          return Promise.resolve({ meta: { changes: 1 } });
        }),
      };
      return stmt;
    }),
    batch: vi.fn((stmts: unknown[]) =>
      // recordSession reads meta.changes from the first batched stmt.
      Promise.resolve(stmts.map(() => ({ meta: { changes: 1 } }))),
    ),
  } as unknown as D1Database;
}

/** In-memory KV good enough for the rate limiter. */
function makeKV(): KVNamespace {
  const store = new Map<string, string>();
  return {
    get: vi.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
    put: vi.fn((k: string, v: string) => {
      store.set(k, v);
      return Promise.resolve();
    }),
  } as unknown as KVNamespace;
}

function makeEnv(db: D1Database): Env {
  return {
    DB: db,
    CACHE: makeKV(),
    SESSION_SIGNING_KEY: SIGNING_KEY,
    ROOM_LIVE: {
      idFromName: vi.fn(),
      get: vi.fn(),
    },
  } as unknown as Env;
}

function makeApp(env: Env) {
  const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
  app.route("/v1/sessions", sessionsRoutes);
  return {
    fetch: (req: Request) =>
      app.fetch(req, env, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      } as unknown as ExecutionContext),
  };
}

async function authHeader(userId: string): Promise<string> {
  const token = await signToken(userId, SIGNING_KEY, TOKEN_TTL);
  return `Bearer ${token}`;
}

function makeUploadRequest(
  body: unknown,
  auth: string,
  extraHeaders: Record<string, string> = {},
): Request {
  return new Request("http://localhost/v1/sessions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: auth,
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
}

function record(overrides: Record<string, unknown> = {}) {
  return {
    id: "sess-1",
    source: "claude-code",
    model: "claude-3-5-sonnet-20241022",
    inTokens: 100,
    outTokens: 50,
    costUsdCents: 0,
    startedAt: new Date("2026-06-15T10:00:00Z").getTime(),
    endedAt: new Date("2026-06-15T10:01:00Z").getTime(),
    dedupeKey: "hash-1",
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("POST /v1/sessions — revoked device", () => {
  it("short-circuits with 401 and never prices or rolls up", async () => {
    const plan: D1Plan = {
      firstFor: [
        // devices lookup → revoked
        {
          match: (s) => s.includes("FROM devices WHERE device_id"),
          value: { user_id: "user-1", revoked_at: 1_700_000_000_000 },
        },
      ],
      preparedSql: [],
      runs: [],
    };
    const env = makeEnv(makeD1(plan));
    const app = makeApp(env);

    const res = await app.fetch(
      makeUploadRequest({ sessions: [record()] }, await authHeader("user-1"), {
        "X-Device-Id": "device-abcdef12",
      }),
    );

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("device_revoked");

    // Pricing catalog must never have been touched for a revoked device.
    expect(plan.preparedSql.some((s) => s.includes("models_catalog"))).toBe(false);
    expect(plan.preparedSql.some((s) => s.includes("INSERT OR IGNORE INTO sessions"))).toBe(false);
  });
});

describe("POST /v1/sessions — malformed device id", () => {
  it("drops a malformed X-Device-Id and ingests with device_id NULL", async () => {
    const plan: D1Plan = {
      // No devices lookup expected because the malformed id is dropped to null.
      firstFor: [
        {
          match: (s) => s.includes("models_catalog WHERE id"),
          value: { id: "claude-3-5-sonnet-20241022" },
        },
        {
          match: (s) => s.includes("FROM model_price_snapshots"),
          value: { input_per_mtok: 300, output_per_mtok: 1500, day: "2026-06-15" },
        },
        { match: (s) => s.includes("FROM users WHERE id"), value: { handle: "alice" } },
      ],
      preparedSql: [],
      runs: [],
    };
    const env = makeEnv(makeD1(plan));
    const app = makeApp(env);

    const res = await app.fetch(
      makeUploadRequest({ sessions: [record()] }, await authHeader("user-1"), {
        // contains a space → fails isPlausibleDeviceId → dropped
        "X-Device-Id": "not a valid id",
      }),
    );

    expect(res.status).toBe(200);
    // A dropped device id means no devices lookup runs at all.
    expect(plan.preparedSql.some((s) => s.includes("FROM devices WHERE device_id"))).toBe(false);
  });
});

describe("POST /v1/sessions — batched pricing (no per-session N+1)", () => {
  it("loads the price catalog once for a multi-record batch, not once per session", async () => {
    const plan: D1Plan = {
      firstFor: [{ match: (s) => s.includes("FROM users WHERE id"), value: { handle: "alice" } }],
      preparedSql: [],
      runs: [],
    };
    const env = makeEnv(makeD1(plan));
    const app = makeApp(env);

    const res = await app.fetch(
      makeUploadRequest(
        {
          sessions: [
            record({ id: "sess-a", dedupeKey: "hash-a", inTokens: 100, outTokens: 50 }),
            record({ id: "sess-b", dedupeKey: "hash-b", inTokens: 200, outTokens: 80 }),
            // a zero-token record still rides along in the same batch
            record({ id: "sess-c", dedupeKey: "hash-c", inTokens: 0, outTokens: 0 }),
          ],
        },
        await authHeader("user-1"),
      ),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { accepted: number; duplicates: number };
    expect(body.accepted).toBe(3);
    // The price index is loaded exactly ONCE per request via loadPriceIndex, then
    // every record is priced in-memory — not a per-session priceOf round-trip.
    // With the old code, models_catalog would be queried once per priced record.
    expect(plan.preparedSql.filter((s) => s.includes("FROM models_catalog"))).toHaveLength(1);
    expect(plan.preparedSql.filter((s) => s.includes("FROM model_price_snapshots"))).toHaveLength(
      1,
    );
  });
});

describe("POST /v1/sessions — empty heartbeat", () => {
  it("accepts an empty batch with no device as a no-op heartbeat", async () => {
    const plan: D1Plan = { firstFor: [], preparedSql: [], runs: [] };
    const env = makeEnv(makeD1(plan));
    const app = makeApp(env);

    const res = await app.fetch(makeUploadRequest({ sessions: [] }, await authHeader("user-1")));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { accepted: number; duplicates: number };
    expect(body).toEqual({ accepted: 0, duplicates: 0 });
    // Nothing should have been inserted.
    expect(plan.preparedSql.some((s) => s.includes("INSERT OR IGNORE INTO sessions"))).toBe(false);
  });

  it("bumps the device heartbeat when an empty batch carries a device id", async () => {
    const plan: D1Plan = {
      firstFor: [
        // devices lookup → not revoked, fresh device
        { match: (s) => s.includes("FROM devices WHERE device_id"), value: null },
      ],
      preparedSql: [],
      runs: [],
    };
    const env = makeEnv(makeD1(plan));
    const app = makeApp(env);

    const res = await app.fetch(
      makeUploadRequest({ sessions: [] }, await authHeader("user-1"), {
        "X-Device-Id": "device-abcdef12",
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { accepted: number; duplicates: number };
    expect(body).toEqual({ accepted: 0, duplicates: 0 });
    // The heartbeat path runs UPDATE devices SET last_heartbeat_at.
    expect(plan.runs.some((r) => r.sql.includes("last_heartbeat_at"))).toBe(true);
  });

  it("rejects an empty-batch heartbeat from a revoked device with 401", async () => {
    const plan: D1Plan = {
      firstFor: [
        {
          match: (s) => s.includes("FROM devices WHERE device_id"),
          value: { user_id: "user-1", revoked_at: 1_700_000_000_000 },
        },
      ],
      preparedSql: [],
      runs: [],
    };
    const env = makeEnv(makeD1(plan));
    const app = makeApp(env);

    const res = await app.fetch(
      makeUploadRequest({ sessions: [] }, await authHeader("user-1"), {
        "X-Device-Id": "device-abcdef12",
      }),
    );

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("device_revoked");
    expect(plan.runs.some((r) => r.sql.includes("last_heartbeat_at"))).toBe(false);
  });
});

describe("POST /v1/sessions — auth", () => {
  it("returns 401 without a token", async () => {
    const plan: D1Plan = { firstFor: [], preparedSql: [], runs: [] };
    const env = makeEnv(makeD1(plan));
    const app = makeApp(env);

    const res = await app.fetch(
      new Request("http://localhost/v1/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessions: [] }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns a validation error for a malformed body", async () => {
    const plan: D1Plan = { firstFor: [], preparedSql: [], runs: [] };
    const env = makeEnv(makeD1(plan));
    const app = makeApp(env);

    const res = await app.fetch(
      makeUploadRequest({ sessions: [{ id: "x" }] }, await authHeader("user-1")),
    );
    expect(res.status).toBe(400);
  });
});
