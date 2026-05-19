/**
 * Daily price-refresh cron.
 *
 * Pulls the live model catalog + pricing from OpenRouter's public
 * `/api/v1/models` endpoint, normalizes it into our catalog shape, and writes:
 *   - One upsert per model into `models_catalog` (keyed by canonical id).
 *   - One snapshot per (model, today) into `model_price_snapshots` — the
 *     primary key on (day, model_id) makes a same-day re-run idempotent.
 *
 * Then deactivates any non-seed, non-session-inferred catalog row that hasn't
 * been seen for 7+ days. Rows manually seeded by migration 0015 and rows
 * inferred from incoming sessions are preserved — those are user-driven and
 * shouldn't disappear just because OpenRouter dropped them.
 *
 * OpenRouter chosen as the primary aggregator because it carries pricing for
 * ~300 models across ~60 providers in a single public JSON response — vastly
 * more coverage than the Worker could realistically scrape per-provider in one
 * cron pass. Direct Anthropic / OpenAI API calls can be layered on later when
 * a model the project actually bills against isn't in OpenRouter.
 */

import type { Env } from "../env.js";

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

interface OpenRouterModel {
  id: string; // e.g. "anthropic/claude-opus-4.5"
  name?: string;
  context_length?: number;
  architecture?: {
    modality?: string; // "text->text" | "text+image->text" | ...
    input_modalities?: string[];
    output_modalities?: string[];
  };
  pricing?: {
    // OpenRouter quotes prices in USD per single token (string-encoded float).
    prompt?: string;
    completion?: string;
    image?: string;
    request?: string;
  };
}

interface OpenRouterResponse {
  data: OpenRouterModel[];
}

interface CatalogRow {
  id: string;
  provider: string;
  family: string | null;
  display_name: string | null;
  modality: string | null;
  context_window: number | null;
  source_id: string;
}

interface SnapshotRow {
  model_id: string;
  input_per_mtok: number;
  output_per_mtok: number | null;
}

export interface RefreshResult {
  fetched: number;
  upserts: number;
  snapshots: number;
  deactivated: number;
  errors: string[];
}

/* -------------------------------------------------------------------------- */
/* Normalization                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Turn an OpenRouter `provider/model.with.dots` into a bare model id that
 * matches what sessions actually store (hyphenated). Returns null if the
 * shape doesn't include a slash (we only track namespaced rows).
 */
export function normalizeId(openRouterId: string): { provider: string; bareId: string } | null {
  const slash = openRouterId.indexOf("/");
  if (slash <= 0 || slash === openRouterId.length - 1) return null;

  const provider = openRouterId.slice(0, slash);
  // Replace dots with hyphens in the bare id so 'claude-opus-4.5' aligns with
  // the 'claude-opus-4-5' string Claude Code emits in its JSONL logs.
  const bareId = openRouterId.slice(slash + 1).replace(/\./g, "-");
  return { provider, bareId };
}

/** Coarse modality bucket from OpenRouter's compound `architecture.modality`. */
function modalityBucket(mod: string | undefined, inputs: string[] | undefined): string | null {
  if (!mod && !inputs) return null;
  const all = [mod ?? "", ...(inputs ?? [])].join(" ").toLowerCase();
  if (all.includes("image") || all.includes("vision")) return "multimodal";
  if (all.includes("audio") || all.includes("voice")) return "audio";
  if (all.includes("embed")) return "embedding";
  return "text";
}

/**
 * Extract a family prefix for grouping (`claude-opus-4-7` → `claude-opus-4`).
 * Strips a trailing `-N` numeric segment. Returns the bare id if no segment
 * looks numeric so we never accidentally produce an empty family.
 */
function familyOf(bareId: string): string {
  const stripped = bareId.replace(/-(\d+(?:-\d+)*)$/, "");
  return stripped.length > 0 ? stripped : bareId;
}

/** Parse OpenRouter's string-encoded per-token price into a per-million number. */
function perMtok(priceStr: string | undefined): number | null {
  if (!priceStr) return null;
  const n = Number(priceStr);
  if (!Number.isFinite(n) || n < 0) return null;
  return n * 1_000_000;
}

/**
 * Normalize one OpenRouter row. Returns null when the row is missing both
 * pricing fields (free models, beta listings without prices, etc.).
 */
export function normalizeOpenRouterModel(
  m: OpenRouterModel,
): { catalog: CatalogRow; snapshot: SnapshotRow } | null {
  const idParts = normalizeId(m.id);
  if (!idParts) return null;

  const input = perMtok(m.pricing?.prompt);
  if (input === null) return null; // No input price = nothing to bill against
  const output = perMtok(m.pricing?.completion);

  const catalog: CatalogRow = {
    id: idParts.bareId,
    provider: idParts.provider,
    family: familyOf(idParts.bareId),
    display_name: m.name ?? null,
    modality: modalityBucket(m.architecture?.modality, m.architecture?.input_modalities),
    context_window: m.context_length ?? null,
    source_id: m.id,
  };

  const snapshot: SnapshotRow = {
    model_id: idParts.bareId,
    input_per_mtok: input,
    output_per_mtok: output,
  };

  return { catalog, snapshot };
}

/* -------------------------------------------------------------------------- */
/* Cron entrypoint                                                            */
/* -------------------------------------------------------------------------- */

/** UTC YYYY-MM-DD at this moment. */
function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function refreshPrices(env: Env): Promise<RefreshResult> {
  const errors: string[] = [];
  const today = utcToday();
  const fetchedAt = Date.now();

  // 1. Fetch OpenRouter
  let models: OpenRouterModel[] = [];
  try {
    const res = await fetch(OPENROUTER_MODELS_URL, {
      headers: { "User-Agent": "token-rats-cron/0.1" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as OpenRouterResponse;
    models = json.data ?? [];
  } catch (err) {
    errors.push(`openrouter: ${err instanceof Error ? err.message : String(err)}`);
    return { fetched: 0, upserts: 0, snapshots: 0, deactivated: 0, errors };
  }

  // 2. Normalize rows
  const catalogRows: CatalogRow[] = [];
  const snapshotRows: SnapshotRow[] = [];
  for (const m of models) {
    const norm = normalizeOpenRouterModel(m);
    if (!norm) continue;
    catalogRows.push(norm.catalog);
    snapshotRows.push(norm.snapshot);
  }

  // 3. Write in batches. D1 batch() counts as one subrequest — keep chunks at
  //    50 so a 300-model refresh stays well inside Worker limits.
  const CHUNK = 50;

  let upserts = 0;
  for (let i = 0; i < catalogRows.length; i += CHUNK) {
    const slice = catalogRows.slice(i, i + CHUNK);
    const stmts = slice.map((r) =>
      env.DB.prepare(
        `INSERT INTO models_catalog
           (id, provider, family, display_name, modality, context_window,
            is_active, first_seen_day, last_seen_day, source, source_id)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, 'openrouter', ?)
         ON CONFLICT(id) DO UPDATE SET
           provider       = excluded.provider,
           family         = excluded.family,
           display_name   = excluded.display_name,
           modality       = excluded.modality,
           context_window = excluded.context_window,
           is_active      = 1,
           last_seen_day  = excluded.last_seen_day,
           source         = 'openrouter',
           source_id      = excluded.source_id`,
      ).bind(
        r.id,
        r.provider,
        r.family,
        r.display_name,
        r.modality,
        r.context_window,
        today,
        today,
        r.source_id,
      ),
    );
    try {
      await env.DB.batch(stmts);
      upserts += stmts.length;
    } catch (err) {
      errors.push(`catalog batch ${i}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  let snapshots = 0;
  for (let i = 0; i < snapshotRows.length; i += CHUNK) {
    const slice = snapshotRows.slice(i, i + CHUNK);
    const stmts = slice.map((r) =>
      env.DB.prepare(
        `INSERT INTO model_price_snapshots
           (day, model_id, input_per_mtok, output_per_mtok, source, fetched_at)
         VALUES (?, ?, ?, ?, 'openrouter', ?)
         ON CONFLICT(day, model_id) DO UPDATE SET
           input_per_mtok  = excluded.input_per_mtok,
           output_per_mtok = excluded.output_per_mtok,
           source          = 'openrouter',
           fetched_at      = excluded.fetched_at`,
      ).bind(today, r.model_id, r.input_per_mtok, r.output_per_mtok, fetchedAt),
    );
    try {
      await env.DB.batch(stmts);
      snapshots += stmts.length;
    } catch (err) {
      errors.push(`snapshot batch ${i}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 4. Soft-deprecate rows we haven't seen for a week. Skip seed + inferred
  //    rows — those are managed by humans, not by OpenRouter's availability.
  let deactivated = 0;
  try {
    const res = await env.DB.prepare(
      `UPDATE models_catalog
         SET is_active = 0
       WHERE is_active = 1
         AND source NOT IN ('manual-seed', 'session-inferred', 'cursor-estimate')
         AND last_seen_day < DATE('now', '-7 days')`,
    ).run();
    deactivated = res.meta?.changes ?? 0;
  } catch (err) {
    errors.push(`deactivate: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { fetched: models.length, upserts, snapshots, deactivated, errors };
}
