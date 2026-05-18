/**
 * Unit tests for the KV-backed rate limiter.
 *
 * Uses an in-memory KV stub — no Worker env required.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { rateLimit } from "./rate-limit.js";

/* ---------- minimal KV stub ------------------------------------------------ */

class MockKV {
  private store = new Map<string, string>();

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

function asKV(mock: MockKV): KVNamespace {
  return mock as unknown as KVNamespace;
}

/* ---------- tests ---------------------------------------------------------- */

describe("rateLimit", () => {
  let kv: MockKV;

  beforeEach(() => {
    kv = new MockKV();
  });

  it("allows requests below the limit", async () => {
    const limit = 5;
    for (let i = 0; i < limit; i++) {
      const result = await rateLimit(asKV(kv), "user-1", limit);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(limit - i - 1);
    }
  });

  it("blocks the request at the limit", async () => {
    const limit = 3;
    for (let i = 0; i < limit; i++) {
      await rateLimit(asKV(kv), "user-2", limit);
    }
    const blocked = await rateLimit(asKV(kv), "user-2", limit);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("uses separate windows per user", async () => {
    const limit = 1;
    const r1 = await rateLimit(asKV(kv), "alice", limit);
    expect(r1.allowed).toBe(true);

    // alice exhausted, bob should still be allowed
    await rateLimit(asKV(kv), "alice", limit); // exhausts alice
    const r2 = await rateLimit(asKV(kv), "bob", limit);
    expect(r2.allowed).toBe(true);
  });
});
