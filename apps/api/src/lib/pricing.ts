/**
 * Server-side token-cost lookup, backed by the D1 catalog + price snapshots
 * that migration 0015 introduces. Replaces the static `@token-rats/pricing`
 * table — that one shipped a single hard-coded price per model; this one
 * carries every historical day so retroactive cost recompute is precise.
 *
 * Two-step lookup:
 *   1. Resolve the raw model string to a canonical `models_catalog.id`.
 *      Exact match first; fall back to longest-prefix match so date-suffixed
 *      variants like `claude-opus-4-7-20260101` find their family row.
 *   2. Pick the latest snapshot with `day <= sessionDay` (carry-forward) and
 *      compute cost as round((inTok·input + outTok·output) / 1_000_000 * 100).
 *
 * KV cache (5 min TTL) memoises the (raw model + day) → price tuple so the
 * hot ingest path doesn't pay a D1 round-trip per session. Misses are cached
 * too — a single negative entry stops thrashing when a CLI floods us with an
 * unknown model ID.
 *
 * Unknown-model side effect: when resolution fails we insert a stub row into
 * `models_catalog` with `source='session-inferred'` and `is_active=0`. That's
 * the data the daily cron reads to "guide roadmap" — every fly-by model the
 * users actually billed against shows up as a row to triage.
 */

import type { Env } from "../env.js";
import { toUtcDay } from "./ingest.js";

const CACHE_TTL_SECONDS = 300;

export interface PriceResult {
  costUsdCents: number;
  /** true if we found a snapshot, false if we billed at $0 due to no pricing data. */
  known: boolean;
  /** Canonical model_id from models_catalog if resolved, otherwise the input model. */
  resolvedModelId: string;
  /** Day of the snapshot used. Useful for audit/recompute. Null on miss. */
  sourceDay: string | null;
}

interface CachedPrice {
  resolvedModelId: string;
  inputPerMTok: number;
  outputPerMTok: number;
  sourceDay: string;
}

interface CachedMiss {
  miss: true;
}

type CacheEntry = CachedPrice | CachedMiss;

function cacheKey(model: string, day: string): string {
  return `price:v1:${day}:${model}`;
}

/** Resolve a raw model string to a `models_catalog.id`. Exact PK first, then longest-prefix. */
async function resolveCatalogId(env: Env, model: string): Promise<string | null> {
  const exact = await env.DB.prepare("SELECT id FROM models_catalog WHERE id = ? LIMIT 1")
    .bind(model)
    .first<{ id: string }>();
  if (exact) return exact.id;

  // Longest-prefix match: `model` must start with `id`. Order by id length DESC
  // so 'claude-opus-4-7-20260101' resolves to 'claude-opus-4-7' rather than
  // 'claude-opus-4-6' if both happen to match a leading substring.
  const prefix = await env.DB.prepare(
    "SELECT id FROM models_catalog WHERE ? LIKE id || '%' ORDER BY length(id) DESC LIMIT 1",
  )
    .bind(model)
    .first<{ id: string }>();
  return prefix?.id ?? null;
}

/** Latest snapshot for `modelId` with `day <= sessionDay`. */
async function fetchSnapshot(
  env: Env,
  modelId: string,
  sessionDay: string,
): Promise<{ input_per_mtok: number; output_per_mtok: number | null; day: string } | null> {
  return await env.DB.prepare(
    `SELECT input_per_mtok, output_per_mtok, day
       FROM model_price_snapshots
      WHERE model_id = ? AND day <= ?
      ORDER BY day DESC
      LIMIT 1`,
  )
    .bind(modelId, sessionDay)
    .first<{ input_per_mtok: number; output_per_mtok: number | null; day: string }>();
}

/** Record an unknown model so the roadmap dashboard can surface "needs source" rows. */
async function recordSessionInferred(env: Env, model: string): Promise<void> {
  // Best-effort insert — if the same unknown model fires 1000x in a batch we
  // only want one row, so ON CONFLICT just bumps last_seen_day.
  await env.DB.prepare(
    `INSERT INTO models_catalog
       (id, provider, family, display_name, modality, is_active,
        first_seen_day, last_seen_day, source, notes)
     VALUES (?, 'unknown', NULL, ?, NULL, 0, DATE('now'), DATE('now'),
             'session-inferred', 'Auto-created on first sighting in /v1/sessions or /v1/proxy')
     ON CONFLICT(id) DO UPDATE SET last_seen_day = DATE('now')`,
  )
    .bind(model, model)
    .run()
    .catch((err) => {
      // Non-fatal — don't block the session ingest if the catalog write fails.
      console.error("[pricing] recordSessionInferred failed", { model, err });
    });
}

/**
 * Look up the price for `(model, day)` and return the cost in USD cents.
 *
 * `dayIso` should be the UTC day of the session (`toUtcDay(startedAt)`) so
 * historical sessions get billed at their actual-day price.
 *
 * Unknown models return `known: false, costUsdCents: 0`. The model is logged
 * to `models_catalog` as `source='session-inferred'` for roadmap discovery.
 */
export async function priceOf(
  env: Env,
  model: string,
  dayIso: string,
  inTokens: number,
  outTokens: number,
): Promise<PriceResult> {
  // ── 1. Cache lookup ────────────────────────────────────────────────────────
  const key = cacheKey(model, dayIso);
  const cached = (await env.CACHE.get(key, "json").catch(() => null)) as CacheEntry | null;

  if (cached && "miss" in cached) {
    return { costUsdCents: 0, known: false, resolvedModelId: model, sourceDay: null };
  }
  if (cached) {
    const dollars = (inTokens * cached.inputPerMTok + outTokens * cached.outputPerMTok) / 1_000_000;
    return {
      costUsdCents: Math.round(dollars * 100),
      known: true,
      resolvedModelId: cached.resolvedModelId,
      sourceDay: cached.sourceDay,
    };
  }

  // ── 2. Resolve canonical model_id ──────────────────────────────────────────
  const resolvedId = await resolveCatalogId(env, model);
  if (!resolvedId) {
    // Cache the miss so a repeated unknown model doesn't hammer D1.
    await env.CACHE.put(key, JSON.stringify({ miss: true } satisfies CachedMiss), {
      expirationTtl: CACHE_TTL_SECONDS,
    }).catch(() => undefined);
    // Fire-and-forget: surface to the roadmap.
    await recordSessionInferred(env, model);
    return { costUsdCents: 0, known: false, resolvedModelId: model, sourceDay: null };
  }

  // ── 3. Fetch carry-forward snapshot ────────────────────────────────────────
  const snap = await fetchSnapshot(env, resolvedId, dayIso);
  if (!snap) {
    // Catalog row exists but no priced snapshot ≤ day — happens for newly
    // discovered models whose first snapshot lands on a future date relative
    // to a backfilled historical session.
    await env.CACHE.put(key, JSON.stringify({ miss: true } satisfies CachedMiss), {
      expirationTtl: CACHE_TTL_SECONDS,
    }).catch(() => undefined);
    return { costUsdCents: 0, known: false, resolvedModelId: resolvedId, sourceDay: null };
  }

  const inputPerMTok = snap.input_per_mtok;
  const outputPerMTok = snap.output_per_mtok ?? 0; // Embeddings / image: no output rate

  // ── 4. Cache + compute ─────────────────────────────────────────────────────
  await env.CACHE.put(
    key,
    JSON.stringify({
      resolvedModelId: resolvedId,
      inputPerMTok,
      outputPerMTok,
      sourceDay: snap.day,
    } satisfies CachedPrice),
    { expirationTtl: CACHE_TTL_SECONDS },
  ).catch(() => undefined);

  const dollars = (inTokens * inputPerMTok + outTokens * outputPerMTok) / 1_000_000;
  return {
    costUsdCents: Math.round(dollars * 100),
    known: true,
    resolvedModelId: resolvedId,
    sourceDay: snap.day,
  };
}

/**
 * In-memory price index for bulk pricing (e.g. the admin recompute).
 *
 * `priceOf` does at least one KV/D1 round-trip per call, which is fine on the
 * single-session ingest path but explodes the Cloudflare subrequest budget
 * when pricing the whole `sessions` table in one request. `loadPriceIndex`
 * pulls the two (small) price tables into memory once; `priceWithIndex` then
 * resolves each session with zero I/O, replicating priceOf's exact→prefix
 * resolution + carry-forward snapshot semantics.
 */
export interface PriceIndex {
  /** All catalog ids, longest-first, for prefix resolution. */
  catalogIdsByLenDesc: string[];
  catalogIdSet: Set<string>;
  /** model_id → snapshots sorted by day ASC (ISO strings sort chronologically). */
  snapshotsByModel: Map<string, Array<{ day: string; input: number; output: number }>>;
}

export async function loadPriceIndex(env: Env): Promise<PriceIndex> {
  const cat = await env.DB.prepare("SELECT id FROM models_catalog").all<{ id: string }>();
  const ids = (cat.results ?? []).map((r) => r.id);

  const snaps = await env.DB.prepare(
    "SELECT model_id, day, input_per_mtok, output_per_mtok FROM model_price_snapshots ORDER BY day ASC",
  ).all<{
    model_id: string;
    day: string;
    input_per_mtok: number;
    output_per_mtok: number | null;
  }>();

  const snapshotsByModel = new Map<string, Array<{ day: string; input: number; output: number }>>();
  for (const s of snaps.results ?? []) {
    const arr = snapshotsByModel.get(s.model_id) ?? [];
    arr.push({ day: s.day, input: s.input_per_mtok, output: s.output_per_mtok ?? 0 });
    snapshotsByModel.set(s.model_id, arr);
  }

  return {
    catalogIdsByLenDesc: [...ids].sort((a, b) => b.length - a.length),
    catalogIdSet: new Set(ids),
    snapshotsByModel,
  };
}

/** Pure, I/O-free equivalent of `priceOf` backed by a preloaded `PriceIndex`. */
export function priceWithIndex(
  index: PriceIndex,
  model: string,
  dayIso: string,
  inTokens: number,
  outTokens: number,
): PriceResult {
  let resolvedId: string | null = null;
  if (index.catalogIdSet.has(model)) {
    resolvedId = model;
  } else {
    for (const id of index.catalogIdsByLenDesc) {
      if (model.startsWith(id)) {
        resolvedId = id;
        break;
      }
    }
  }
  if (!resolvedId) {
    return { costUsdCents: 0, known: false, resolvedModelId: model, sourceDay: null };
  }

  // Carry-forward: latest snapshot with day <= dayIso (snapshots are day-ASC).
  let chosen: { day: string; input: number; output: number } | null = null;
  for (const s of index.snapshotsByModel.get(resolvedId) ?? []) {
    if (s.day <= dayIso) chosen = s;
    else break;
  }
  if (!chosen) {
    return { costUsdCents: 0, known: false, resolvedModelId: resolvedId, sourceDay: null };
  }

  const dollars = (inTokens * chosen.input + outTokens * chosen.output) / 1_000_000;
  return {
    costUsdCents: Math.round(dollars * 100),
    known: true,
    resolvedModelId: resolvedId,
    sourceDay: chosen.day,
  };
}

/** Convenience wrapper for callers that have a millisecond timestamp. */
export async function priceOfAtMs(
  env: Env,
  model: string,
  tsMs: number,
  inTokens: number,
  outTokens: number,
): Promise<PriceResult> {
  return priceOf(env, model, toUtcDay(tsMs), inTokens, outTokens);
}
