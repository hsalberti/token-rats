import type { SessionRecord } from "@token-rats/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { recordSession, recordSessionsBatch, toUtcDay } from "./ingest.js";
import { testDatabase } from "./test-db.js";
let setup: ReturnType<typeof testDatabase>;
beforeEach(() => {
  setup = testDatabase();
});
afterEach(() => setup.db.close());
const record = (overrides: Partial<SessionRecord> = {}): SessionRecord => ({
  id: "s1",
  source: "codex",
  model: "gpt-test",
  inTokens: 100,
  outTokens: 50,
  costUsdCents: 3,
  startedAt: Date.parse("2026-09-01T12:00:00Z"),
  endedAt: Date.parse("2026-09-01T12:01:00Z"),
  dedupeKey: "key1",
  ...overrides,
});
const rollup = () => setup.db.prepare("SELECT * FROM daily_rollup WHERE user_id = 'alice'").get();
describe("atomic usage ingestion", () => {
  it("uses UTC days", () =>
    expect(toUtcDay(Date.parse("2026-09-01T23:59:59Z"))).toBe("2026-09-01"));
  it("deduplicates retries and duplicate records within one batch", async () => {
    const result = await recordSessionsBatch(setup.env, "alice", [record(), record(), record()]);
    expect(result.inserted).toEqual([true, false, false]);
    expect(rollup()).toMatchObject({ tokens: 150, sessions: 1, cost_usd_cents: 3 });
  });
  it("updates cache-only growth once", async () => {
    await recordSession(setup.env, "alice", record());
    const next = record({ cacheReadTokens: 1000, costUsdCents: 4 });
    expect((await recordSession(setup.env, "alice", next)).inserted).toBe(true);
    expect((await recordSession(setup.env, "alice", next)).inserted).toBe(false);
    expect(setup.db.prepare("SELECT * FROM daily_rollup_by_model").get()).toMatchObject({
      cache_read_tokens: 1000,
      sessions: 1,
    });
  });
  it("moves totals to the current model when a session changes models", async () => {
    await recordSession(setup.env, "alice", record());
    await recordSession(setup.env, "alice", record({ model: "different", inTokens: 150 }));
    expect(
      setup.db.prepare("SELECT model, in_tokens, out_tokens FROM daily_rollup_by_model").all(),
    ).toEqual([{ model: "different", in_tokens: 150, out_tokens: 50 }]);
  });
  it("accepts one parser correction and rejects old parser uploads", async () => {
    await recordSession(setup.env, "alice", record({ outTokens: 100 }));
    await recordSession(setup.env, "alice", record({ outTokens: 50, accountingVersion: 2 }));
    await recordSession(setup.env, "alice", record({ outTokens: 100 }));
    expect(rollup()).toMatchObject({ tokens: 150, sessions: 1 });
  });
  it("does not let another user alter an existing session", async () => {
    await recordSession(setup.env, "alice", record());
    expect((await recordSession(setup.env, "bob", record({ inTokens: 500 }))).inserted).toBe(false);
    expect(rollup()).toMatchObject({ tokens: 150 });
  });
  it("rejects stale snapshots", async () => {
    await recordSession(setup.env, "alice", record());
    await recordSession(setup.env, "alice", record({ endedAt: 1000, inTokens: 10000 }));
    expect(rollup()).toMatchObject({ tokens: 150 });
  });
  it("rolls back session and rollups together on a failed batch", async () => {
    setup.db.exec(
      "CREATE TRIGGER reject_second BEFORE INSERT ON sessions WHEN NEW.id = 's2' BEGIN SELECT RAISE(ABORT, 'test failure'); END;",
    );
    await expect(
      recordSessionsBatch(setup.env, "alice", [record(), record({ id: "s2", dedupeKey: "key2" })]),
    ).rejects.toThrow();
    expect(setup.db.prepare("SELECT * FROM sessions").all()).toEqual([]);
    expect(rollup()).toBeUndefined();
  });
  it("handles 250 records without exceeding the statement batch limit", async () => {
    const records = Array.from({ length: 250 }, (_, i) =>
      record({ id: `s${i}`, dedupeKey: `k${i}` }),
    );
    expect((await recordSessionsBatch(setup.env, "alice", records)).acceptedCount).toBe(250);
    expect(rollup()).toMatchObject({ tokens: 37500, sessions: 250 });
  });
});
