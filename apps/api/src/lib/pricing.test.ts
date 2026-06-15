/**
 * Unit tests for the D1-backed priceOf helper (apps/api/src/lib/pricing.ts).
 *
 * We don't spin up a real D1 — we mock `env.DB.prepare(...).first()` and
 * `env.CACHE.get/put` so the resolution + carry-forward logic can be exercised
 * deterministically.
 */

import { describe, expect, it, vi } from "vitest";
import type { Env } from "../env.js";
import { priceOf } from "./pricing.js";

/* -------------------------------------------------------------------------- */
/* Mock builders                                                              */
/* -------------------------------------------------------------------------- */

interface MockCatalog {
  /** Map from raw model string → resolved canonical id (or null). */
  resolutions?: Record<string, string | null>;
}

interface MockSnapshots {
  /** Map from `${modelId}@${day}` → snapshot tuple. Resolution uses the largest
   *  day ≤ requested. */
  byModel?: Record<
    string,
    Array<{ day: string; input_per_mtok: number; output_per_mtok: number | null }>
  >;
}

/** Build a tiny env mock. The DB is wired to consult the supplied resolution
 *  + snapshot maps; KV starts empty and is just an in-memory Map. */
function makeEnv(catalog: MockCatalog = {}, snaps: MockSnapshots = {}): Env {
  const kv = new Map<string, string>();
  const inferredCalls: string[] = [];

  const prepare = vi.fn((sql: string) => {
    const stmt = {
      _bound: [] as unknown[],
      bind(...args: unknown[]) {
        this._bound = args;
        return this;
      },
      async first<T = unknown>(): Promise<T | null> {
        // Catalog exact-match
        if (sql.includes("SELECT id FROM models_catalog WHERE id = ?")) {
          const raw = this._bound[0] as string;
          const resolved = catalog.resolutions?.[raw];
          return resolved ? ({ id: resolved } as unknown as T) : null;
        }
        // Catalog longest-prefix
        if (sql.includes("WHERE ? LIKE id || '%'")) {
          const raw = this._bound[0] as string;
          // Walk every known canonical id; pick the longest that `raw` starts with.
          const candidates = Object.values(catalog.resolutions ?? {}).filter(
            (v): v is string => typeof v === "string",
          );
          const distinct = Array.from(new Set(candidates));
          let best: string | null = null;
          for (const id of distinct) {
            if (raw.startsWith(id)) {
              if (best === null || id.length > best.length) best = id;
            }
          }
          return best ? ({ id: best } as unknown as T) : null;
        }
        // Snapshot lookup
        if (sql.includes("FROM model_price_snapshots")) {
          const [modelId, asOfDay] = this._bound as [string, string];
          const rows = snaps.byModel?.[modelId] ?? [];
          const valid = rows
            .filter((r) => r.day <= asOfDay)
            .sort((a, b) => (a.day < b.day ? 1 : -1));
          return (valid[0] ?? null) as unknown as T | null;
        }
        return null;
      },
      async run() {
        // recordSessionInferred path
        if (sql.includes("INSERT INTO models_catalog")) {
          inferredCalls.push(this._bound[0] as string);
        }
        return { meta: { changes: 1 } };
      },
    };
    return stmt as unknown as D1PreparedStatement;
  });

  return {
    DB: { prepare } as unknown as D1Database,
    CACHE: {
      async get(key: string, _type?: "json") {
        const v = kv.get(key);
        if (v === undefined) return null;
        return JSON.parse(v);
      },
      async put(key: string, value: string) {
        kv.set(key, value);
      },
    } as unknown as KVNamespace,
    _inferredCalls: inferredCalls,
  } as unknown as Env;
}

/* -------------------------------------------------------------------------- */
/* Tests                                                                       */
/* -------------------------------------------------------------------------- */

describe("priceOf", () => {
  it("exact-matches a known model and computes cost from its latest snapshot", async () => {
    const env = makeEnv(
      { resolutions: { "claude-opus-4-7": "claude-opus-4-7" } },
      {
        byModel: {
          "claude-opus-4-7": [{ day: "2026-05-01", input_per_mtok: 15, output_per_mtok: 75 }],
        },
      },
    );

    const r = await priceOf(env, "claude-opus-4-7", "2026-05-19", 1_000_000, 1_000_000);
    // 1M*15 + 1M*75 = $90 → 9000 cents
    expect(r.known).toBe(true);
    expect(r.resolvedModelId).toBe("claude-opus-4-7");
    expect(r.costUsdCents).toBe(9000);
    expect(r.sourceDay).toBe("2026-05-01");
  });

  it("falls back to longest-prefix when the raw model is date-suffixed", async () => {
    const env = makeEnv(
      {
        resolutions: { "claude-opus-4-7": "claude-opus-4-7", "claude-opus-4-6": "claude-opus-4-6" },
      },
      {
        byModel: {
          "claude-opus-4-7": [{ day: "2026-05-01", input_per_mtok: 15, output_per_mtok: 75 }],
        },
      },
    );

    // Note: exact-match on the full string fails (no row for 'claude-opus-4-7-20260101'),
    // so resolveCatalogId hits the LIKE branch and picks the longer 'claude-opus-4-7' over
    // 'claude-opus-4-6'.
    const r = await priceOf(env, "claude-opus-4-7-20260101", "2026-05-19", 0, 100);
    expect(r.known).toBe(true);
    expect(r.resolvedModelId).toBe("claude-opus-4-7");
  });

  it("carries forward the latest snapshot whose day <= sessionDay", async () => {
    const env = makeEnv(
      { resolutions: { "claude-haiku-4-5": "claude-haiku-4-5" } },
      {
        byModel: {
          "claude-haiku-4-5": [
            { day: "2026-01-01", input_per_mtok: 1.0, output_per_mtok: 5.0 },
            { day: "2026-03-15", input_per_mtok: 0.8, output_per_mtok: 4.0 },
            { day: "2026-06-01", input_per_mtok: 0.5, output_per_mtok: 2.5 }, // in the future
          ],
        },
      },
    );

    // A session on 2026-04-01 must use the 2026-03-15 snapshot (latest ≤ day),
    // NOT the 2026-06-01 future snapshot.
    const r = await priceOf(env, "claude-haiku-4-5", "2026-04-01", 1_000_000, 1_000_000);
    expect(r.sourceDay).toBe("2026-03-15");
    expect(r.costUsdCents).toBe(Math.round((1 * 0.8 + 1 * 4.0) * 100));
  });

  it("prices the synthetic cursor-composer model from its early snapshot (regression)", async () => {
    // Migration 0016 seeded cursor-composer at claude-3-5-sonnet rates but with
    // a snapshot dated the migration day, so historical sessions found no
    // snapshot ≤ their day and billed $0. Migration 0020 backfills an early
    // (2024-01-01) snapshot so carry-forward covers every Cursor session.
    const env = makeEnv(
      { resolutions: { "cursor-composer": "cursor-composer" } },
      {
        byModel: {
          "cursor-composer": [{ day: "2024-01-01", input_per_mtok: 3.0, output_per_mtok: 15.0 }],
        },
      },
    );

    // A composer turn = 10_000 in / 2_000 out (see packages/parsers/src/cursor.ts).
    // 10_000*3 + 2_000*15 = 60_000 → /1e6 = $0.06 → 6 cents.
    const r = await priceOf(env, "cursor-composer", "2026-06-15", 10_000, 2_000);
    expect(r.known).toBe(true);
    expect(r.resolvedModelId).toBe("cursor-composer");
    expect(r.sourceDay).toBe("2024-01-01");
    expect(r.costUsdCents).toBe(6);
  });

  it("returns known=false and costUsdCents=0 for an unknown model", async () => {
    const env = makeEnv({ resolutions: {} }, {});

    const r = await priceOf(env, "totally-fake-model", "2026-05-19", 100, 200);
    expect(r.known).toBe(false);
    expect(r.costUsdCents).toBe(0);
    expect(r.sourceDay).toBeNull();
    // Should have logged the unknown model into the catalog
    expect((env as unknown as { _inferredCalls: string[] })._inferredCalls).toContain(
      "totally-fake-model",
    );
  });

  it("caches a hit and reuses it on the next call without re-querying D1", async () => {
    const env = makeEnv(
      { resolutions: { "gpt-4o": "gpt-4o" } },
      { byModel: { "gpt-4o": [{ day: "2026-05-01", input_per_mtok: 2.5, output_per_mtok: 10 }] } },
    );

    await priceOf(env, "gpt-4o", "2026-05-19", 100, 200);

    // prepare was called for: catalog exact-match + snapshot lookup (2 calls).
    // No prefix-match needed since exact match hit.
    const prepareMock = (env.DB as unknown as { prepare: ReturnType<typeof vi.fn> }).prepare;
    const callsAfterFirst = prepareMock.mock.calls.length;

    // Second call with identical args should be served from KV — no further D1.
    await priceOf(env, "gpt-4o", "2026-05-19", 100, 200);
    expect(prepareMock.mock.calls.length).toBe(callsAfterFirst);
  });

  it("caches a miss so a repeated unknown model doesn't thrash D1", async () => {
    const env = makeEnv({ resolutions: {} }, {});

    await priceOf(env, "ghost-model", "2026-05-19", 1, 1);
    const prepareMock = (env.DB as unknown as { prepare: ReturnType<typeof vi.fn> }).prepare;
    const callsAfterFirst = prepareMock.mock.calls.length;

    await priceOf(env, "ghost-model", "2026-05-19", 99, 99);
    expect(prepareMock.mock.calls.length).toBe(callsAfterFirst);
  });
});
