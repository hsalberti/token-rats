/**
 * parseCursor — converts Cursor generation events (exported from per-workspace
 * sqlite caches by the CLI) into SessionRecord[].
 *
 * ## Input format
 * A JSON string (or UTF-8 Uint8Array/ArrayBuffer) containing an array of
 * CursorRow objects. One row = one Cursor AI generation event.
 *
 * Expected row shape:
 * ```ts
 * {
 *   id:     string;   // Cursor's generationUUID
 *   type:   string;   // "composer" | "tab" | other Cursor-internal label
 *   unixMs: number;   // ms epoch of the event
 * }
 * ```
 *
 * ## Why estimates, not real token counts
 * Cursor does NOT store token counts in its local sqlite cache — the raw
 * generation records are just `{ unixMs, generationUUID, type, textDescription }`.
 * Real per-request token totals only live on cursor.com servers. So we
 * estimate, conservatively, from the request type:
 *
 *   - "composer"        ≈ a full agentic chat turn → 10 000 input / 2 000 output
 *     (matches the rough weight of one premium Cursor request, billed roughly
 *     like a Claude-3.5-Sonnet call)
 *   - everything else   → skipped (Tab autocomplete and other small models
 *     would inflate counts without representing meaningful AI usage)
 *
 * Numbers in the leaderboard for Cursor are therefore *estimates*. Friends can
 * compare relative usage but the absolute total won't match cursor.com to the
 * token. We pin the cost using a fixed claude-3-5-sonnet rate so the dollar
 * figure stays consistent across users and self-explanatory in the UI.
 *
 * ## Privacy
 * `textDescription` is dropped at the extractor layer (packages/cli/src/lib/
 * cursor-extract.ts) and never reaches this parser. No prompt or completion
 * content is read, stored, or returned anywhere in the pipeline.
 */

import type { SessionRecord } from "@token-rats/contracts";
import { computeDedupeKey } from "./hash.js";

/** Token estimates per Cursor request type. */
const ESTIMATES: Record<string, { inTokens: number; outTokens: number; model: string } | null> = {
  composer: { inTokens: 10_000, outTokens: 2_000, model: "cursor-composer" },
  // "tab" deliberately omitted — see file header.
};

/**
 * Cost rate, hard-pinned to claude-3-5-sonnet pricing so all users see the
 * same dollar estimate for the same request count. Source: prices.json at the
 * time of writing — $3/MTok input, $15/MTok output.
 */
const INPUT_USD_PER_MTOK = 3;
const OUTPUT_USD_PER_MTOK = 15;

function estimatedCostCents(inTokens: number, outTokens: number): number {
  const dollars =
    (inTokens / 1_000_000) * INPUT_USD_PER_MTOK + (outTokens / 1_000_000) * OUTPUT_USD_PER_MTOK;
  return Math.round(dollars * 100);
}

/** Raw row shape as exported from Cursor's per-workspace sqlite caches. */
interface CursorRow {
  id: string;
  type: string;
  unixMs: number;
}

export function parseCursor(input: string | ArrayBuffer | Uint8Array): SessionRecord[] {
  let text: string;
  if (typeof input === "string") {
    text = input;
  } else {
    text = new TextDecoder().decode(input instanceof ArrayBuffer ? new Uint8Array(input) : input);
  }

  let rows: unknown;
  try {
    rows = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(rows)) return [];

  const results: SessionRecord[] = [];

  for (const raw of rows) {
    if (typeof raw !== "object" || raw === null) continue;
    const row = raw as Record<string, unknown>;

    const id = typeof row.id === "string" ? row.id : null;
    if (!id) continue;

    const type = typeof row.type === "string" ? row.type : null;
    if (!type) continue;

    const unixMs =
      typeof row.unixMs === "number" && Number.isFinite(row.unixMs) && row.unixMs > 0
        ? row.unixMs
        : null;
    if (unixMs === null) continue;

    const estimate = ESTIMATES[type];
    if (!estimate) continue; // skip unsupported types (e.g. "tab")

    const { inTokens, outTokens, model } = estimate;
    const costUsdCents = estimatedCostCents(inTokens, outTokens);
    const dedupeKey = computeDedupeKey("cursor", model, unixMs, inTokens, outTokens);

    results.push({
      id: `cursor:${id}`,
      source: "cursor",
      provider: "cursor",
      model,
      inTokens,
      outTokens,
      costUsdCents,
      startedAt: unixMs,
      endedAt: unixMs,
      dedupeKey,
    });
  }

  return results;
}
