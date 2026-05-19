/**
 * Unit tests for the recordSession helper (apps/api/src/lib/ingest.ts).
 *
 * These tests exercise the helper without a real D1 database by constructing
 * a minimal in-memory mock that tracks the SQL statements executed.
 */

import { describe, it, expect, vi, type Mock } from "vitest";
import { toUtcDay, recordSession } from "./ingest.js";
import type { Env } from "../env.js";
import type { SessionRecord } from "@token-rats/contracts";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** Build a minimal SessionRecord for testing. */
function makeRecord(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: "sess-001",
    source: "claude-code",
    model: "claude-3-5-sonnet-20241022",
    inTokens: 100,
    outTokens: 50,
    costUsdCents: 5,
    startedAt: new Date("2024-06-15T10:00:00Z").getTime(),
    endedAt: new Date("2024-06-15T10:01:00Z").getTime(),
    dedupeKey: "hash-abc",
    ...overrides,
  };
}

/** Build a minimal D1 mock. The `changes` value controls whether the
 *  INSERT is treated as new (changes=1) or duplicate (changes=0). */
function makeD1Mock(changes: number): Pick<D1Database, "prepare"> {
  const runMock = vi.fn().mockResolvedValue({ meta: { changes } });
  const batchMock = vi.fn().mockResolvedValue([{ meta: { changes } }]);

  const stmtMock = {
    bind: vi.fn().mockReturnThis(),
    run: runMock,
    first: vi.fn().mockResolvedValue(null),
    all: vi.fn().mockResolvedValue({ results: [] }),
  };

  return {
    prepare: vi.fn().mockReturnValue(stmtMock),
    // satisfy the D1Database type — the helper only uses prepare/batch
    batch: batchMock,
  } as unknown as Pick<D1Database, "prepare">;
}

/**
 * Minimal KV mock — `recordSession` calls `env.CACHE.delete` to bust the
 * friends-cache (Track AD) and the per-user primary-source cache (Track AF).
 * Without this stub the helper throws on the cache writes.
 */
function makeKvMock(): KVNamespace {
  return {
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue({ keys: [] }),
    getWithMetadata: vi.fn().mockResolvedValue({ value: null, metadata: null }),
  } as unknown as KVNamespace;
}

function makeEnv(d1: Pick<D1Database, "prepare">): Env {
  return { DB: d1, CACHE: makeKvMock() } as unknown as Env;
}

/* -------------------------------------------------------------------------- */
/* Tests                                                                       */
/* -------------------------------------------------------------------------- */

describe("toUtcDay", () => {
  it("formats a timestamp as YYYY-MM-DD UTC", () => {
    expect(toUtcDay(new Date("2024-06-15T23:59:59Z").getTime())).toBe("2024-06-15");
  });

  it("does not bleed into the next day for late UTC timestamps", () => {
    // 2024-12-31T23:59:00Z should remain 2024-12-31
    expect(toUtcDay(new Date("2024-12-31T23:59:00Z").getTime())).toBe("2024-12-31");
  });
});

describe("recordSession", () => {
  it("returns { inserted: true } and runs daily_rollup upsert for a new session", async () => {
    const d1 = makeD1Mock(1); // changes=1 → new row
    const env = makeEnv(d1);
    const record = makeRecord();

    const result = await recordSession(env, "user-1", record);

    expect(result.inserted).toBe(true);
    // prepare should be called at least twice: once for INSERT, once for rollup
    expect((d1.prepare as Mock).mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("returns { inserted: false } for a duplicate session and skips the rollup", async () => {
    const d1 = makeD1Mock(0); // changes=0 → duplicate
    const env = makeEnv(d1);
    const record = makeRecord();

    const result = await recordSession(env, "user-1", record);

    expect(result.inserted).toBe(false);
    // Only the INSERT should be prepared; rollup upsert must NOT run
    expect((d1.prepare as Mock).mock.calls.length).toBe(1);
  });

  it("uses the session's startedAt timestamp to derive the rollup day", async () => {
    const d1 = makeD1Mock(1);
    const env = makeEnv(d1);
    // A session that started at exactly midnight UTC on 2024-08-01
    const record = makeRecord({ startedAt: new Date("2024-08-01T00:00:00Z").getTime() });

    await recordSession(env, "user-1", record);

    // prepare() is called three times: INSERT, rollup upsert, and the
    // co-member lookup in bustFriendCachesForCoMembers (Track AD).
    expect((d1.prepare as Mock).mock.calls.length).toBe(3);

    // Both prepare() calls return the same stmtMock (mockReturnValue), so
    // bind() is recorded on the same object. The INSERT is bind call [0];
    // the rollup upsert is bind call [1] with args (userId, day, tokens, cost, 1).
    const stmtResult = (d1.prepare as Mock).mock.results[0]?.value as {
      bind: Mock;
    };
    const rollupBindArgs = stmtResult?.bind?.mock.calls[1] as unknown[];
    expect(rollupBindArgs).toBeDefined();
    // rollupBindArgs = [userId, day, tokens, costUsdCents, sessionCount]
    expect(rollupBindArgs[0]).toBe("user-1");
    expect(rollupBindArgs[1]).toBe("2024-08-01");
  });
});
