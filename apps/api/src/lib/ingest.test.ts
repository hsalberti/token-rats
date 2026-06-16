/**
 * Unit tests for the recordSession helper (apps/api/src/lib/ingest.ts).
 *
 * These tests exercise the helper without a real D1 database by constructing
 * a minimal in-memory mock that tracks the SQL statements executed.
 */

import type { SessionRecord } from "@token-rats/contracts";
import { type Mock, describe, expect, it, vi } from "vitest";
import type { Env } from "../env.js";
import { recordSession, recordSessionsBatch, toUtcDay } from "./ingest.js";

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

function makeEnv(d1: Pick<D1Database, "prepare">): Env {
  return { DB: d1 } as unknown as Env;
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
  it("returns { inserted: true } and runs both rollup upserts for a new session", async () => {
    const d1 = makeD1Mock(1); // changes=1 → new row
    const env = makeEnv(d1);
    const record = makeRecord();

    const result = await recordSession(env, "user-1", record);

    expect(result.inserted).toBe(true);
    // prepare is called 3 times: INSERT, legacy daily_rollup, granular
    // daily_rollup_by_model.
    expect((d1.prepare as Mock).mock.calls.length).toBe(3);
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

    // prepare() is called 3 times: INSERT, legacy rollup, granular rollup.
    expect((d1.prepare as Mock).mock.calls.length).toBe(3);

    // All prepare() calls return the same stmtMock (mockReturnValue), so
    // bind() is recorded on the same object. bind[0] = INSERT, bind[1] =
    // legacy daily_rollup, bind[2] = daily_rollup_by_model.
    const stmtResult = (d1.prepare as Mock).mock.results[0]?.value as {
      bind: Mock;
    };
    const legacyRollupBind = stmtResult?.bind?.mock.calls[1] as unknown[];
    expect(legacyRollupBind).toBeDefined();
    // legacyRollupBind = [userId, day, tokens, costUsdCents, sessionCount]
    expect(legacyRollupBind[0]).toBe("user-1");
    expect(legacyRollupBind[1]).toBe("2024-08-01");
  });

  it("derives provider from source when the CLI omits it (back-compat)", async () => {
    const d1 = makeD1Mock(1);
    const env = makeEnv(d1);
    // No `provider` field — emulates a v0 CLI on pre-0013 contracts.
    const record = makeRecord({ source: "codex", model: "gpt-5.3-codex" });

    await recordSession(env, "user-1", record);

    const stmtResult = (d1.prepare as Mock).mock.results[0]?.value as { bind: Mock };
    const insertBind = stmtResult?.bind?.mock.calls[0] as unknown[];
    // INSERT bind order: id, userId, source, provider, client, channel, model, ...
    expect(insertBind[2]).toBe("codex");
    expect(insertBind[3]).toBe("openai");
    expect(insertBind[4]).toBe("codex-cli");
    expect(insertBind[5]).toBe("cli");

    const granularBind = stmtResult?.bind?.mock.calls[2] as unknown[];
    // granular bind order: userId, day, source, provider, model, ...
    expect(granularBind[2]).toBe("codex");
    expect(granularBind[3]).toBe("openai");
    expect(granularBind[4]).toBe("gpt-5.3-codex");
  });

  it("stamps device_id when caller provides one", async () => {
    const d1 = makeD1Mock(1);
    const env = makeEnv(d1);
    const record = makeRecord({ id: "sess-pc1", dedupeKey: "hash-pc1" });

    await recordSession(env, "user-1", record, { deviceId: "device-aaa" });

    const stmtResult = (d1.prepare as Mock).mock.results[0]?.value as { bind: Mock };
    const insertBind = stmtResult?.bind?.mock.calls[0] as unknown[];
    // device_id is the LAST bind argument (column #17 in the INSERT).
    expect(insertBind[insertBind.length - 1]).toBe("device-aaa");
  });

  it("multi-device: two sessions for the same user with different device_ids both insert and sum into daily_rollup", async () => {
    // Regression coverage for the vmarcial-class bug: PC1 syncs one session,
    // PC2 syncs a different session under the same user. The contract is that
    // both inserts succeed (different ids, different dedupe_keys) and the
    // daily_rollup upsert runs for each.
    const d1 = makeD1Mock(1);
    const env = makeEnv(d1);

    const sessionFromPc1 = makeRecord({
      id: "sess-pc1",
      dedupeKey: "hash-pc1",
      inTokens: 100,
      outTokens: 50,
    });
    const sessionFromPc2 = makeRecord({
      id: "sess-pc2",
      dedupeKey: "hash-pc2",
      inTokens: 200,
      outTokens: 75,
    });

    const r1 = await recordSession(env, "user-vmarcial", sessionFromPc1, {
      deviceId: "device-pc1",
    });
    const r2 = await recordSession(env, "user-vmarcial", sessionFromPc2, {
      deviceId: "device-pc2",
    });

    expect(r1.inserted).toBe(true);
    expect(r2.inserted).toBe(true);
    // Two records × (INSERT + 2 rollup upserts) = 6 prepare() calls.
    expect((d1.prepare as Mock).mock.calls.length).toBe(6);
  });

  it("forwards granular cache + reasoning fields when provided", async () => {
    const d1 = makeD1Mock(1);
    const env = makeEnv(d1);
    const record = makeRecord({
      source: "claude-code",
      provider: "anthropic",
      cacheReadTokens: 12_000,
      cacheWriteTokens: 800,
      reasoningTokens: 0,
    });

    await recordSession(env, "user-1", record);

    const stmtResult = (d1.prepare as Mock).mock.results[0]?.value as { bind: Mock };
    const insertBind = stmtResult?.bind?.mock.calls[0] as unknown[];
    // INSERT bind order continues:
    //   ..., model, in_tokens, out_tokens, cache_read, cache_write, reasoning, ...
    expect(insertBind[9]).toBe(12_000);
    expect(insertBind[10]).toBe(800);
    expect(insertBind[11]).toBe(0);

    const granularBind = stmtResult?.bind?.mock.calls[2] as unknown[];
    // granular bind order continues:
    //   ..., in_tokens, out_tokens, cache_read, cache_write, reasoning, cost, 1
    expect(granularBind[7]).toBe(12_000);
    expect(granularBind[8]).toBe(800);
    expect(granularBind[9]).toBe(0);
  });

  it("preserves explicit client + channel when the caller provides them", async () => {
    const d1 = makeD1Mock(1);
    const env = makeEnv(d1);
    const record = makeRecord({
      source: "claude-code",
      provider: "openrouter",
      client: "openclaw",
      channel: "api",
    });

    await recordSession(env, "user-1", record);

    const stmtResult = (d1.prepare as Mock).mock.results[0]?.value as { bind: Mock };
    const insertBind = stmtResult?.bind?.mock.calls[0] as unknown[];
    expect(insertBind[3]).toBe("openrouter");
    expect(insertBind[4]).toBe("openclaw");
    expect(insertBind[5]).toBe("api");
  });
});

/* -------------------------------------------------------------------------- */
/* Batched ingest                                                              */
/* -------------------------------------------------------------------------- */

interface BatchCall {
  sql: string;
  binds: unknown[];
}

/**
 * D1 mock that records every prepared statement (SQL + its bind args) and
 * returns one result per statement on `batch()` — so the chunked-batch path
 * can map per-row `meta.changes` back to each record.
 *
 * `insertedFor(id)` decides which `INSERT OR IGNORE` rows count as new
 * (changes=1) vs duplicate (changes=0); every other statement reports changes=1.
 */
function makeBatchD1Mock(insertedFor: (sessionId: string) => boolean): {
  db: Pick<D1Database, "prepare">;
  calls: BatchCall[];
  batchSizes: number[];
} {
  const calls: BatchCall[] = [];
  const batchSizes: number[] = [];

  const db = {
    prepare: (sql: string) => {
      const stmt = {
        sql,
        binds: [] as unknown[],
        bind(...args: unknown[]) {
          stmt.binds = args;
          calls.push({ sql, binds: args });
          return stmt;
        },
      };
      return stmt;
    },
    batch: async (stmts: Array<{ sql: string; binds: unknown[] }>) => {
      batchSizes.push(stmts.length);
      return stmts.map((s) => {
        const isInsert = s.sql.includes("INSERT OR IGNORE INTO sessions");
        const sessionId = isInsert ? String(s.binds[0]) : "";
        const changes = isInsert ? (insertedFor(sessionId) ? 1 : 0) : 1;
        return { meta: { changes } };
      });
    },
  } as unknown as Pick<D1Database, "prepare">;

  return { db, calls, batchSizes };
}

describe("recordSessionsBatch", () => {
  it("prices + writes a large multi-record ingest via chunked batches", async () => {
    // 250 records → INSERT batches chunk at 100 (100 + 100 + 50), and each of
    // the 250 inserts contributes 2 rollup upserts = 500 statements chunked at
    // 100 (5 batches of 100).
    const COUNT = 250;
    const { db, calls, batchSizes } = makeBatchD1Mock(() => true);
    const env = makeEnv(db);

    const records = Array.from({ length: COUNT }, (_, i) =>
      makeRecord({
        id: `sess-${i}`,
        dedupeKey: `hash-${i}`,
        inTokens: i,
        outTokens: i * 2,
        costUsdCents: i + 1,
      }),
    );

    const result = await recordSessionsBatch(env, "user-bulk", records, {
      deviceId: "device-bulk",
    });

    expect(result.acceptedCount).toBe(COUNT);
    expect(result.inserted.every((x) => x === true)).toBe(true);

    // No batch may exceed the D1 100-statement limit.
    expect(Math.max(...batchSizes)).toBeLessThanOrEqual(100);
    // 3 insert chunks (100/100/50) + 5 rollup chunks (100×5 of 500 statements).
    expect(batchSizes).toEqual([100, 100, 50, 100, 100, 100, 100, 100]);

    const insertCalls = calls.filter((c) => c.sql.includes("INSERT OR IGNORE INTO sessions"));
    expect(insertCalls.length).toBe(COUNT);
    // device_id is stamped on every insert (last bind arg).
    expect(insertCalls.every((c) => c.binds[c.binds.length - 1] === "device-bulk")).toBe(true);
    // cost is carried through to the insert (column 13, 0-indexed 12).
    expect(insertCalls[10]?.binds[12]).toBe(11);

    const legacyRollupCalls = calls.filter((c) => c.sql.includes("INSERT INTO daily_rollup ("));
    const modelRollupCalls = calls.filter((c) =>
      c.sql.includes("INSERT INTO daily_rollup_by_model"),
    );
    expect(legacyRollupCalls.length).toBe(COUNT);
    expect(modelRollupCalls.length).toBe(COUNT);
  });

  it("skips rollups for duplicate rows and reports them as not inserted", async () => {
    // Even-indexed sessions are duplicates (changes=0) → no rollup statements.
    const { db, calls } = makeBatchD1Mock((id) => {
      const n = Number(id.split("-")[1]);
      return n % 2 === 1;
    });
    const env = makeEnv(db);

    const records = Array.from({ length: 10 }, (_, i) =>
      makeRecord({ id: `sess-${i}`, dedupeKey: `hash-${i}` }),
    );

    const result = await recordSessionsBatch(env, "user-1", records);

    // 5 odd indices inserted, 5 even duplicates skipped.
    expect(result.acceptedCount).toBe(5);
    expect(result.inserted).toEqual([
      false,
      true,
      false,
      true,
      false,
      true,
      false,
      true,
      false,
      true,
    ]);

    const legacyRollupCalls = calls.filter((c) => c.sql.includes("INSERT INTO daily_rollup ("));
    // Only the 5 inserted rows get a rollup upsert.
    expect(legacyRollupCalls.length).toBe(5);
  });

  it("returns an empty result without touching the DB for zero records", async () => {
    const { db, calls } = makeBatchD1Mock(() => true);
    const env = makeEnv(db);

    const result = await recordSessionsBatch(env, "user-1", []);

    expect(result.acceptedCount).toBe(0);
    expect(result.inserted).toEqual([]);
    expect(calls.length).toBe(0);
  });
});
