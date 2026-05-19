/**
 * parseCursor — converts Cursor request rows (exported from its sqlite cache by
 * the CLI) into SessionRecord[].
 *
 * ## Input format
 * A JSON string (or UTF-8 Uint8Array/ArrayBuffer) containing an array of
 * CursorRow objects. One row = one Cursor AI request.
 *
 * Expected row shape:
 * ```ts
 * {
 *   id:               string;  // unique request id
 *   model:            string;  // Cursor-side model name, e.g. "claude-3.5-sonnet"
 *   promptTokens:     number;  // input token count
 *   completionTokens: number;  // output token count
 *   startedAt:        number;  // ms epoch
 *   endedAt:          number;  // ms epoch
 * }
 * ```
 *
 * ## Model-name mapping
 * Cursor stores shortened/variant model names. `CURSOR_MODEL_MAP` translates
 * them to the canonical names in `packages/pricing/src/prices.json`.
 * Unknown model names pass through unchanged — priceOf() will return
 * costUsdCents: 0 for them, which is correct per spec.
 *
 * ## Privacy
 * No prompt or completion text is ever read, stored, or returned.
 */

import type { SessionRecord, SourcePlan } from "@token-rats/contracts";
import { priceOf } from "@token-rats/pricing";
import { computeDedupeKey } from "./hash.js";

/**
 * v1.2 Track AF — Cursor is always an IDE-context source. The exported
 * row shape (see `CursorRow` below) doesn't carry a plan/subscription
 * field today, and even when it did the only meaningful distinction
 * we'd surface is "Cursor IDE", so we always emit `'ide'`. A caller
 * can override via `defaultPlan` if a future Cursor build adds tiers.
 */
export interface ParseCursorOptions {
  defaultPlan?: SourcePlan;
}

/** Maps Cursor model names → canonical pricing-table model names. */
const CURSOR_MODEL_MAP: Record<string, string> = {
  // Claude models — Cursor uses abbreviated names without date suffixes
  "claude-3.5-sonnet": "claude-3-5-sonnet-20241022",
  "claude-3-5-sonnet": "claude-3-5-sonnet-20241022",
  "claude-3.5-haiku": "claude-3-5-haiku-20241022",
  "claude-3-5-haiku": "claude-3-5-haiku-20241022",
  "claude-3.5-opus": "claude-3-opus-20240229",
  "claude-3-opus": "claude-3-opus-20240229",
  "claude-3-sonnet": "claude-3-sonnet-20240229",
  "claude-3-haiku": "claude-3-haiku-20240307",
  // GPT models — Cursor may omit date suffixes
  "gpt-4o-mini": "gpt-4o-mini",
  "gpt-4o": "gpt-4o",
  "gpt-4-turbo": "gpt-4-turbo",
};

/** Raw row shape as exported from Cursor's sqlite cache by the CLI. */
interface CursorRow {
  id: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  startedAt: number;
  endedAt: number;
}

export function parseCursor(
  input: string | ArrayBuffer | Uint8Array,
  opts: ParseCursorOptions = {},
): SessionRecord[] {
  const sourcePlan: SourcePlan = opts.defaultPlan ?? "ide";
  // Normalise input to string
  let text: string;
  if (typeof input === "string") {
    text = input;
  } else {
    text = new TextDecoder().decode(input instanceof ArrayBuffer ? new Uint8Array(input) : input);
  }

  // Parse outer JSON array
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

    // Validate required fields
    const id = typeof row["id"] === "string" ? row["id"] : null;
    if (!id) continue;

    const rawModel = typeof row["model"] === "string" ? row["model"] : "";
    const model = rawModel.length > 0 ? (CURSOR_MODEL_MAP[rawModel] ?? rawModel) : "unknown";

    const inTokens = toNonNegInt(row["promptTokens"]);
    const outTokens = toNonNegInt(row["completionTokens"]);

    const startedAt =
      typeof row["startedAt"] === "number" && isFinite(row["startedAt"]) && row["startedAt"] > 0
        ? row["startedAt"]
        : null;
    const endedAt =
      typeof row["endedAt"] === "number" && isFinite(row["endedAt"]) && row["endedAt"] > 0
        ? row["endedAt"]
        : null;

    // Both timestamps must be present
    if (startedAt === null || endedAt === null) continue;

    const { costUsdCents } = priceOf(model, inTokens, outTokens);

    const dedupeKey = computeDedupeKey("cursor", model, startedAt, inTokens, outTokens);

    results.push({
      id: `cursor:${id}`,
      source: "cursor",
      model,
      inTokens,
      outTokens,
      costUsdCents,
      startedAt,
      endedAt,
      dedupeKey,
      sourcePlan,
    });
  }

  return results;
}

/** Coerce an unknown value to a non-negative integer, defaulting to 0. */
function toNonNegInt(v: unknown): number {
  if (typeof v !== "number" || !isFinite(v)) return 0;
  return Math.max(0, Math.floor(v));
}
