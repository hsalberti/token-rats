/**
 * Migration-backed integration test.
 *
 * Loads every infra/migrations/*.sql file, in order, into a fresh in-memory
 * better-sqlite3 database, then drives the real ingest helper and the real
 * recompute rollup-rebuild SQL against it. This is the only test that runs the
 * production schema + production SQL together, so it catches drift the mocked
 * unit tests can't:
 *
 *   - `recordSession` upserts into `daily_rollup` keyed by `toUtcDay(startedAt)`.
 *   - The leaderboard SUM over `daily_rollup` agrees with those upserts.
 *   - The recompute rebuild buckets by `strftime('%Y-%m-%d', started_at/1000,
 *     'unixepoch')`, which MUST land on the same day string as `toUtcDay`.
 *
 * The day-bucketing assertion is the load-bearing one: ingest uses JS
 * `toUtcDay` while recompute uses SQLite `strftime`. If those ever disagree at
 * a UTC midnight edge, a recompute silently moves tokens to the wrong day.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Env } from "../env.js";
import { recordSession, toUtcDay } from "../lib/ingest.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "..", "..", "..", "..", "infra", "migrations");

/* -------------------------------------------------------------------------- */
/* Minimal D1-over-better-sqlite3 shim                                         */
/* -------------------------------------------------------------------------- */

/**
 * A tiny adapter exposing just the slice of the D1 `prepare/bind/first/all/run`
 * + `batch` surface that `recordSession` / `loadPriceIndex` use. It executes
 * against a real SQLite engine so the schema and SQL are exercised for real.
 */
function makeD1(db: Database.Database): D1Database {
  function prepare(sql: string) {
    let args: unknown[] = [];
    const isSelect = /^\s*select/i.test(sql);
    return {
      bind(...bindArgs: unknown[]) {
        args = bindArgs;
        return this;
      },
      first<T>(): Promise<T | null> {
        const row = db.prepare(sql).get(...(args as never[]));
        return Promise.resolve((row ?? null) as T | null);
      },
      all<T>(): Promise<{ results: T[] }> {
        const rows = db.prepare(sql).all(...(args as never[]));
        return Promise.resolve({ results: rows as T[] });
      },
      run(): Promise<{ meta: { changes: number } }> {
        const info = db.prepare(sql).run(...(args as never[]));
        return Promise.resolve({ meta: { changes: info.changes } });
      },
      // Used internally by batch() below.
      _exec(): { meta: { changes: number } } {
        if (isSelect) {
          db.prepare(sql).all(...(args as never[]));
          return { meta: { changes: 0 } };
        }
        const info = db.prepare(sql).run(...(args as never[]));
        return { meta: { changes: info.changes } };
      },
    };
  }

  return {
    prepare,
    batch(stmts: unknown[]) {
      const results = (stmts as Array<{ _exec(): { meta: { changes: number } } }>).map((s) =>
        s._exec(),
      );
      return Promise.resolve(results);
    },
  } as unknown as D1Database;
}

function loadMigrations(db: Database.Database): void {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    db.exec(sql);
  }
}

function seedUser(db: Database.Database, id: string, handle: string, createdAt: number): void {
  db.prepare(
    "INSERT INTO users (id, github_id, handle, avatar_url, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(
    id,
    Math.abs(handle.split("").reduce((a, c) => a + c.charCodeAt(0), 0)),
    handle,
    null,
    createdAt,
  );
}

function record(overrides: Record<string, unknown> = {}) {
  return {
    id: "sess-1",
    source: "claude-code" as const,
    model: "claude-opus-4-7",
    inTokens: 1000,
    outTokens: 500,
    costUsdCents: 0,
    startedAt: new Date("2026-06-15T10:00:00Z").getTime(),
    endedAt: new Date("2026-06-15T10:01:00Z").getTime(),
    dedupeKey: "hash-1",
    ...overrides,
  };
}

let db: Database.Database;
let env: Env;

beforeEach(() => {
  db = new Database(":memory:");
  loadMigrations(db);
  env = { DB: makeD1(db) } as unknown as Env;
});

afterEach(() => {
  db.close();
});

/* -------------------------------------------------------------------------- */
/* Tests                                                                       */
/* -------------------------------------------------------------------------- */

describe("migration load", () => {
  it("applies every migration and creates the core tables", () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((r) => (r as { name: string }).name);
    expect(tables).toContain("users");
    expect(tables).toContain("sessions");
    expect(tables).toContain("daily_rollup");
    expect(tables).toContain("daily_rollup_by_model");
    expect(tables).toContain("models_catalog");
  });
});

describe("ingest → leaderboard", () => {
  it("rolls a new session into daily_rollup and the leaderboard SUM agrees", async () => {
    seedUser(db, "u1", "alice", new Date("2026-06-01T00:00:00Z").getTime());

    const res = await recordSession(env, "u1", record({ inTokens: 1000, outTokens: 500 }));
    expect(res.inserted).toBe(true);

    const rollup = db
      .prepare("SELECT day, tokens, sessions FROM daily_rollup WHERE user_id = 'u1'")
      .get() as { day: string; tokens: number; sessions: number };
    expect(rollup.day).toBe("2026-06-15");
    expect(rollup.tokens).toBe(1500);
    expect(rollup.sessions).toBe(1);

    // Leaderboard-style SUM over the window.
    const agg = db
      .prepare(
        "SELECT COALESCE(SUM(tokens), 0) AS tokens, COALESCE(SUM(sessions), 0) AS sessions FROM daily_rollup WHERE user_id = 'u1'",
      )
      .get() as { tokens: number; sessions: number };
    expect(agg.tokens).toBe(1500);
    expect(agg.sessions).toBe(1);
  });

  it("dedupes a replayed session (same user + dedupe_key) without double-counting", async () => {
    seedUser(db, "u1", "alice", new Date("2026-06-01T00:00:00Z").getTime());

    const first = await recordSession(env, "u1", record());
    const second = await recordSession(env, "u1", record());

    expect(first.inserted).toBe(true);
    expect(second.inserted).toBe(false);

    const rollup = db
      .prepare("SELECT tokens, sessions FROM daily_rollup WHERE user_id = 'u1'")
      .get() as { tokens: number; sessions: number };
    expect(rollup.tokens).toBe(1500);
    expect(rollup.sessions).toBe(1);
  });
});

describe("recompute day-bucketing matches toUtcDay", () => {
  it("strftime bucketing equals toUtcDay for sessions across UTC-midnight edges", async () => {
    seedUser(db, "u1", "alice", new Date("2026-01-01T00:00:00Z").getTime());

    // Timestamps chosen to straddle UTC midnight and a month boundary.
    const samples = [
      new Date("2026-06-14T23:59:59Z").getTime(),
      new Date("2026-06-15T00:00:00Z").getTime(),
      new Date("2026-06-15T23:59:59.999Z").getTime(),
      new Date("2026-06-30T23:59:59Z").getTime(),
      new Date("2026-07-01T00:00:00Z").getTime(),
    ];

    let i = 0;
    for (const startedAt of samples) {
      await recordSession(
        env,
        "u1",
        record({ id: `sess-${i}`, dedupeKey: `hash-${i}`, startedAt, inTokens: 10, outTokens: 5 }),
      );
      i += 1;
    }

    // For each session, the strftime day used by the recompute rebuild MUST
    // equal toUtcDay(startedAt) used at ingest.
    const rows = db
      .prepare(
        "SELECT started_at, strftime('%Y-%m-%d', started_at / 1000, 'unixepoch') AS sqlite_day FROM sessions WHERE user_id = 'u1' ORDER BY started_at ASC",
      )
      .all() as { started_at: number; sqlite_day: string }[];

    expect(rows).toHaveLength(samples.length);
    for (const r of rows) {
      expect(r.sqlite_day).toBe(toUtcDay(r.started_at));
    }
  });

  it("a full rollup rebuild from sessions reproduces the ingest-time rollup", async () => {
    seedUser(db, "u1", "alice", new Date("2026-01-01T00:00:00Z").getTime());

    const samples = [
      { startedAt: new Date("2026-06-14T23:30:00Z").getTime(), inTokens: 100, outTokens: 20 },
      { startedAt: new Date("2026-06-15T00:30:00Z").getTime(), inTokens: 200, outTokens: 40 },
      { startedAt: new Date("2026-06-15T12:00:00Z").getTime(), inTokens: 300, outTokens: 60 },
    ];

    let i = 0;
    for (const s of samples) {
      await recordSession(env, "u1", record({ id: `sess-${i}`, dedupeKey: `hash-${i}`, ...s }));
      i += 1;
    }

    // Snapshot the ingest-built rollup.
    const ingestRollup = db
      .prepare("SELECT day, tokens, sessions FROM daily_rollup WHERE user_id = 'u1' ORDER BY day")
      .all() as { day: string; tokens: number; sessions: number }[];

    // Run the production recompute rebuild SQL (from admin.ts /prices/recompute).
    db.exec("DELETE FROM daily_rollup");
    db.exec(`
      INSERT INTO daily_rollup (user_id, day, tokens, cost_usd_cents, sessions)
      SELECT user_id,
             strftime('%Y-%m-%d', started_at / 1000, 'unixepoch') AS day,
             SUM(in_tokens + out_tokens),
             SUM(cost_usd_cents),
             COUNT(*)
        FROM sessions
       GROUP BY user_id, day
    `);

    const rebuiltRollup = db
      .prepare("SELECT day, tokens, sessions FROM daily_rollup WHERE user_id = 'u1' ORDER BY day")
      .all() as { day: string; tokens: number; sessions: number }[];

    // The rebuild must reproduce the exact same per-day buckets the ingest path
    // produced — same days, same token sums, same session counts.
    expect(rebuiltRollup).toEqual(ingestRollup);

    // Sanity: two distinct UTC days (Jun 14 and Jun 15), totals preserved.
    expect(rebuiltRollup.map((r) => r.day)).toEqual(["2026-06-14", "2026-06-15"]);
    const total = rebuiltRollup.reduce((s, r) => s + r.tokens, 0);
    expect(total).toBe(120 + 240 + 360);
  });
});
