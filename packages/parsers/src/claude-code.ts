/**
 * parseClaudeCode — converts a Claude Code JSONL session file into SessionRecord[].
 *
 * ## Input format
 * One JSON object per line (JSONL). Each line represents one conversation event.
 * Malformed lines are skipped silently.
 *
 * Expected shape of a relevant (assistant) line:
 * ```
 * {
 *   "type": "assistant",
 *   "session_id": "<uuid-or-slug>",   // required; identifies the session
 *   "timestamp": 1700000001234,       // ms-epoch; optional, falls back to 0
 *   "message": {
 *     "role": "assistant",
 *     "model": "claude-3-5-sonnet-20241022",  // optional; last one wins per session
 *     "content": [...],                         // NOT extracted — counts only
 *     "usage": {
 *       "input_tokens":                number,  // regular input
 *       "output_tokens":               number,
 *       "cache_creation_input_tokens": number,  // counts as input
 *       "cache_read_input_tokens":     number   // counts as input
 *     }
 *   }
 * }
 * ```
 * User-role lines are used only for their `session_id` and `timestamp` (to
 * capture the earliest timestamp of the session). Their `message.content` is
 * never read.
 *
 * ## Aggregation
 * - One SessionRecord per distinct `session_id`.
 * - `startedAt` = earliest timestamp in the session.
 * - `endedAt`   = latest  timestamp in the session.
 * - `model`     = model on the LAST assistant message in the session.
 * - `inTokens`  = Σ(input_tokens)   — uncached input only, matching Claude
 *                                     Code's `/stats` and `/usage` displays.
 *                                     Cache creation/read tokens are excluded
 *                                     from `inTokens` because they would inflate
 *                                     leaderboard totals by 10–100× (every tool
 *                                     call re-reads the whole cache). They are
 *                                     reported separately in `cacheReadTokens`
 *                                     and `cacheWriteTokens` so analytics keep
 *                                     full visibility without distorting headline
 *                                     numbers.
 * - `outTokens` = Σ(output_tokens)
 * - `cacheReadTokens`  = Σ(cache_read_input_tokens)
 * - `cacheWriteTokens` = Σ(cache_creation_input_tokens)
 * - `provider` = "anthropic"
 *
 * ## Privacy
 * No prompt or completion text is ever read, stored, or returned.
 */

import type { SessionRecord } from "@token-rats/contracts";
import { computeDedupeKey } from "./hash.js";

/** Mutable accumulator for one session during parsing. */
interface SessionAcc {
  sessionId: string;
  startedAt: number;
  endedAt: number;
  inTokens: number;
  outTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  model: string;
}

export function parseClaudeCode(input: string | ArrayBuffer | Uint8Array): SessionRecord[] {
  // Normalise input to a string
  let text: string;
  if (typeof input === "string") {
    text = input;
  } else {
    text = new TextDecoder().decode(input instanceof ArrayBuffer ? new Uint8Array(input) : input);
  }

  const sessions = new Map<string, SessionAcc>();

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (line.length === 0) continue;

    // Parse defensively — skip any malformed line
    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }

    if (typeof event !== "object" || event === null) continue;

    const ev = event as Record<string, unknown>;

    // Identify the session — real Claude Code uses camelCase `sessionId`;
    // older test fixtures use `session_id`. Accept both.
    const sidCamel = ev.sessionId;
    const sidSnake = ev.session_id;
    const sessionId =
      typeof sidCamel === "string" ? sidCamel : typeof sidSnake === "string" ? sidSnake : null;
    if (!sessionId) continue;

    // Timestamp: real logs are ISO-8601 strings, fixtures are ms-epoch numbers.
    const rawTs = ev.timestamp;
    let timestamp = 0;
    if (typeof rawTs === "number" && Number.isFinite(rawTs)) {
      timestamp = rawTs;
    } else if (typeof rawTs === "string") {
      const parsed = Date.parse(rawTs);
      if (!Number.isNaN(parsed)) timestamp = parsed;
    }

    // Upsert accumulator
    let acc = sessions.get(sessionId);
    if (!acc) {
      acc = {
        sessionId,
        startedAt: timestamp,
        endedAt: timestamp,
        inTokens: 0,
        outTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        model: "",
      };
      sessions.set(sessionId, acc);
    }

    // Update time bounds
    if (timestamp > 0) {
      if (acc.startedAt === 0 || timestamp < acc.startedAt) acc.startedAt = timestamp;
      if (timestamp > acc.endedAt) acc.endedAt = timestamp;
    }

    // Only assistant messages carry usage + model info
    if (ev.type !== "assistant") continue;

    const message = ev.message;
    if (typeof message !== "object" || message === null) continue;
    const msg = message as Record<string, unknown>;

    // Model: last real model seen per session wins.
    // Skip synthetic internal markers like "<synthetic>" that Claude Code
    // injects for context-window summaries — they contain "<" which fails
    // the API's MODEL_RE charset and carry no real model identity.
    if (typeof msg.model === "string" && msg.model.length > 0 && !msg.model.includes("<")) {
      acc.model = msg.model;
    }

    // Token counts — all optional
    const usage = msg.usage;
    if (typeof usage === "object" && usage !== null) {
      const u = usage as Record<string, unknown>;
      acc.inTokens += toNonNegInt(u.input_tokens);
      acc.outTokens += toNonNegInt(u.output_tokens);
      acc.cacheReadTokens += toNonNegInt(u.cache_read_input_tokens);
      acc.cacheWriteTokens += toNonNegInt(u.cache_creation_input_tokens);
    }
  }

  // Emit one SessionRecord per session
  const results: SessionRecord[] = [];
  for (const acc of sessions.values()) {
    // Skip sessions with no usable timestamps
    const startedAt = acc.startedAt > 0 ? acc.startedAt : acc.endedAt;
    const endedAt = acc.endedAt > 0 ? acc.endedAt : acc.startedAt;
    if (startedAt <= 0 || endedAt <= 0) continue;

    const model = acc.model.length > 0 ? acc.model : "unknown";

    // costUsdCents is intentionally 0 — the server is authoritative for cost
    // (see apps/api/src/lib/pricing.ts). Sending 0 keeps the wire format
    // compatible with the SessionRecord schema; the server overwrites at
    // ingest time using the D1 price catalog.
    const costUsdCents = 0;

    const dedupeKey = computeDedupeKey(
      "claude-code",
      model,
      startedAt,
      acc.inTokens,
      acc.outTokens,
    );

    results.push({
      id: `claude-code:${acc.sessionId}`,
      source: "claude-code",
      provider: "anthropic",
      client: "claude-code",
      channel: "cli",
      model,
      inTokens: acc.inTokens,
      outTokens: acc.outTokens,
      cacheReadTokens: acc.cacheReadTokens,
      cacheWriteTokens: acc.cacheWriteTokens,
      costUsdCents,
      startedAt,
      endedAt,
      dedupeKey,
    });
  }

  return results;
}

/** Coerce an unknown value to a non-negative integer, defaulting to 0. */
function toNonNegInt(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return 0;
  return Math.max(0, Math.floor(v));
}
