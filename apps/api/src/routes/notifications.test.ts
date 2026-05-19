/**
 * Integration tests for the /v1/notifications/unsubscribe endpoint.
 *
 * Mounts the notifications router on a Hono app with a minimal in-memory DB
 * mock and exercises the round-trip: a signed token from `signUnsubscribeToken`
 * flips `weekly_digest = 0`; invalid / tampered tokens are rejected.
 */
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { signUnsubscribeToken } from "../lib/digest.js";
import notifications from "./notifications.js";
import type { Env } from "../env.js";
import type { AuthVariables } from "../middleware/auth.js";

const SIGNING_KEY = "test-signing-key-at-least-32-bytes!!";

/** Lightweight D1 mock that records the last UPSERT bind values. */
function makeDb() {
  const calls: { sql: string; binds: unknown[] }[] = [];

  const stmt = {
    bind: vi.fn(function (this: typeof stmt, ...binds: unknown[]) {
      calls[calls.length - 1]!.binds = binds;
      return this;
    }),
    run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
    first: vi.fn().mockResolvedValue(null),
    all: vi.fn().mockResolvedValue({ results: [] }),
  };

  return {
    db: {
      prepare: vi.fn((sql: string) => {
        calls.push({ sql, binds: [] });
        return stmt;
      }),
    } as unknown as D1Database,
    calls,
  };
}

function makeApp(db: D1Database) {
  const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
  app.route("/v1/notifications", notifications);
  return app;
}

function makeEnv(db: D1Database): Env {
  return {
    DB: db,
    SESSION_SIGNING_KEY: SIGNING_KEY,
    WEB_ORIGIN: "https://tokenrats.com",
  } as unknown as Env;
}

describe("POST /v1/notifications/unsubscribe", () => {
  it("flips weekly_digest off for a valid token", async () => {
    const { db, calls } = makeDb();
    const app = makeApp(db);
    const token = await signUnsubscribeToken("user-xyz", SIGNING_KEY);

    const res = await app.request(
      `/v1/notifications/unsubscribe?token=${encodeURIComponent(token)}`,
      { method: "POST" },
      makeEnv(db),
    );

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("unsubscribed");
    // First DB call should be the upsert with weekly_digest = 0.
    expect(calls.length).toBeGreaterThanOrEqual(1);
    const insert = calls[0]!;
    expect(insert.sql).toContain("notification_prefs");
    expect(insert.binds[0]).toBe("user-xyz");
  });

  it("rejects a missing token", async () => {
    const { db } = makeDb();
    const app = makeApp(db);

    const res = await app.request("/v1/notifications/unsubscribe", { method: "POST" }, makeEnv(db));
    expect(res.status).toBe(400);
  });

  it("rejects a malformed token", async () => {
    const { db } = makeDb();
    const app = makeApp(db);

    const res = await app.request(
      "/v1/notifications/unsubscribe?token=garbage",
      { method: "POST" },
      makeEnv(db),
    );
    expect(res.status).toBe(400);
  });

  it("rejects a token signed with a different key", async () => {
    const { db } = makeDb();
    const app = makeApp(db);
    const token = await signUnsubscribeToken("user-xyz", "another-key-of-32-bytes-or-more!!!");

    const res = await app.request(
      `/v1/notifications/unsubscribe?token=${encodeURIComponent(token)}`,
      { method: "POST" },
      makeEnv(db),
    );
    expect(res.status).toBe(400);
  });

  it("rejects a token with a tampered userId", async () => {
    const { db } = makeDb();
    const app = makeApp(db);
    const token = await signUnsubscribeToken("user-xyz", SIGNING_KEY);
    const parts = token.split(".");
    const tampered = ["other-user", parts[1], parts[2]].join(".");

    const res = await app.request(
      `/v1/notifications/unsubscribe?token=${encodeURIComponent(tampered)}`,
      { method: "POST" },
      makeEnv(db),
    );
    expect(res.status).toBe(400);
  });
});
