/**
 * parseCodex — converts an OpenAI Codex rollout JSONL into SessionRecord[].
 *
 * ## Input format
 * One JSON object per line. Codex writes one file per session under
 * `<codex-home>/sessions/YYYY/MM/DD/rollout-<iso-stamp>-<session-id>.jsonl`.
 *
 * Relevant event shapes:
 *
 * ```jsonc
 * // Identity + start time
 * { "timestamp": "ISO-8601", "type": "session_meta", "payload": {
 *     "id": "<session-id>", "timestamp": "ISO-8601",
 *     "source": "cli", "model_provider": "openai", ... } }
 *
 * // Model picked / changed for the next turn
 * { "timestamp": "ISO-8601", "type": "turn_context", "payload": {
 *     "model": "gpt-5.3-codex", ... } }
 *
 * // Token usage — cumulative totals, fires after every model call
 * { "timestamp": "ISO-8601", "type": "event_msg", "payload": {
 *     "type": "token_count",
 *     "info": {
 *       "total_token_usage": {
 *         "input_tokens":            number,  // total input incl. cached
 *         "cached_input_tokens":     number,  // cached subset of input
 *         "output_tokens":           number,
 *         "reasoning_output_tokens": number,  // billed as output
 *         "total_tokens":            number
 *       },
 *       "last_token_usage": { ...same shape, incremental for the turn },
 *       "model_context_window": number
 *     },
 *     "rate_limits": { ... } } }
 * ```
 *
 * ## Aggregation
 * - One SessionRecord per `session_meta.payload.id`.
 * - `startedAt` = `session_meta.payload.timestamp` (falls back to earliest event).
 * - `endedAt`   = latest event timestamp.
 * - `model`     = last `turn_context.payload.model` seen.
 * - `inTokens`  = (input_tokens − cached_input_tokens) from the last
 *                 non-null `total_token_usage`. The subtraction normalises
 *                 the metric to "uncached billable input", matching the
 *                 Claude Code parser's definition.
 * - `outTokens` = output_tokens, which already includes reasoning output.
 * - `cacheReadTokens` = cached_input_tokens (subtracted out of `inTokens` above,
 *                       reported here so analytics can show what fraction of
 *                       input was cache-served).
 * - `reasoningTokens` = reasoning_output_tokens (a subset of `outTokens` above,
 *                       reported separately so the "thinking tax" is visible).
 * - `provider` = "openai"
 *
 * Token-count events publish *cumulative* totals, so we simply track the
 * latest non-null `total_token_usage` per session — no per-turn summing.
 *
 * ## Privacy
 * Log lines are parsed in memory. Prompts, completions, tool I/O, and
 * instructions are not retained in the accumulator or returned records.
 */

import type { SessionRecord } from "@token-rats/contracts";
import { computeDedupeKey } from "./hash.js";

interface SessionAcc {
  sessionId: string;
  startedAt: number;
  endedAt: number;
  inTokens: number;
  outTokens: number;
  cacheReadTokens: number;
  reasoningTokens: number;
  model: string;
  usageAt: number;
  modelAt: number;
  client: string;
  channel: "cli" | "api" | "unknown";
}

export function parseCodex(input: string | ArrayBuffer | Uint8Array): SessionRecord[] {
  let text: string;
  if (typeof input === "string") {
    text = input;
  } else {
    text = new TextDecoder().decode(input instanceof ArrayBuffer ? new Uint8Array(input) : input);
  }

  const parser = createCodexParser();
  for (const line of text.split("\n")) parser.push(line);
  return parser.finish();
}

/** Accumulate usage one line at a time without retaining log contents. */
export function createCodexParser() {
  const sessions = new Map<string, SessionAcc>();
  // Codex rollouts are one-session-per-file, but we still key by sessionId
  // (taken from session_meta) so we can be tolerant of concatenated input.
  let currentSessionId: string | null = null;

  function push(rawLine: string) {
    const line = rawLine.trim();
    if (line.length === 0) return;

    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch {
      return;
    }
    if (typeof event !== "object" || event === null) return;
    const ev = event as Record<string, unknown>;

    const ts = parseTimestamp(ev.timestamp);
    const type = typeof ev.type === "string" ? ev.type : null;
    const payload =
      typeof ev.payload === "object" && ev.payload !== null
        ? (ev.payload as Record<string, unknown>)
        : null;

    if (type === "session_meta" && payload) {
      const id = typeof payload.id === "string" ? payload.id : null;
      if (!id) {
        currentSessionId = null;
        return;
      }
      currentSessionId = id;
      const metaTs = parseTimestamp(payload.timestamp) || ts;
      const acc = upsert(sessions, id);
      const metaSource = typeof payload.source === "string" ? payload.source : null;
      acc.channel = metaSource === "api" ? "api" : metaSource ? "cli" : "unknown";
      acc.client = acc.channel === "cli" ? "codex-cli" : "codex";
      if (metaTs > 0 && (acc.startedAt === 0 || metaTs < acc.startedAt)) {
        acc.startedAt = metaTs;
      }
      if (metaTs > acc.endedAt) acc.endedAt = metaTs;
      return;
    }

    if (!currentSessionId) return;
    const acc = upsert(sessions, currentSessionId);

    if (ts > 0) {
      if (acc.startedAt === 0) acc.startedAt = ts;
      if (ts > acc.endedAt) acc.endedAt = ts;
    }

    if (type === "turn_context" && payload && typeof payload.model === "string") {
      if (ts >= acc.modelAt) {
        acc.model = payload.model;
        acc.modelAt = ts;
      }
      return;
    }

    if (type === "event_msg" && payload && payload.type === "token_count") {
      const info = payload.info;
      if (typeof info !== "object" || info === null) return;
      const total = (info as Record<string, unknown>).total_token_usage;
      if (typeof total !== "object" || total === null) return;
      const t = total as Record<string, unknown>;
      const inputTotal = toNonNegInt(t.input_tokens);
      const cachedInput = toNonNegInt(t.cached_input_tokens);
      const output = toNonNegInt(t.output_tokens);
      const reasoning = toNonNegInt(t.reasoning_output_tokens);
      // Ignore older snapshots when the same rollout is present in multiple roots.
      if (ts < acc.usageAt) return;
      acc.usageAt = ts;
      // `total_token_usage` is cumulative — replace, don't add.
      acc.inTokens = Math.max(0, inputTotal - cachedInput);
      acc.outTokens = output;
      acc.cacheReadTokens = cachedInput;
      acc.reasoningTokens = reasoning;
    }
  }

  function finish(): SessionRecord[] {
    const results: SessionRecord[] = [];
    for (const acc of sessions.values()) {
      const startedAt = acc.startedAt > 0 ? acc.startedAt : acc.endedAt;
      const endedAt = acc.endedAt > 0 ? acc.endedAt : acc.startedAt;
      if (startedAt <= 0 || endedAt <= 0) continue;

      const model = acc.model.length > 0 ? acc.model : "unknown";

      // costUsdCents is intentionally 0 — the server is authoritative for cost
      // (see apps/api/src/lib/pricing.ts). The server overwrites at ingest.
      const costUsdCents = 0;
      const dedupeKey = computeDedupeKey("codex", model, startedAt, acc.inTokens, acc.outTokens);

      results.push({
        id: `codex:${acc.sessionId}`,
        source: "codex",
        provider: "openai",
        client: acc.client || "codex-cli",
        channel: acc.channel,
        model,
        inTokens: acc.inTokens,
        outTokens: acc.outTokens,
        cacheReadTokens: acc.cacheReadTokens,
        reasoningTokens: acc.reasoningTokens,
        costUsdCents,
        startedAt,
        endedAt,
        dedupeKey,
      });
    }
    return results;
  }

  return {
    push,
    finish,
    startFile() {
      currentSessionId = null;
    },
  };
}

function upsert(map: Map<string, SessionAcc>, sessionId: string): SessionAcc {
  let acc = map.get(sessionId);
  if (!acc) {
    acc = {
      sessionId,
      startedAt: 0,
      endedAt: 0,
      inTokens: 0,
      outTokens: 0,
      cacheReadTokens: 0,
      reasoningTokens: 0,
      model: "",
      usageAt: 0,
      modelAt: 0,
      client: "codex-cli",
      channel: "unknown",
    };
    map.set(sessionId, acc);
  }
  return acc;
}

function parseTimestamp(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const parsed = Date.parse(v);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 0;
}

function toNonNegInt(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return 0;
  return Math.max(0, Math.floor(v));
}
