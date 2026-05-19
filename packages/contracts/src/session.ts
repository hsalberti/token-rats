import { z } from "zod";

export const Source = z.enum(["claude-code", "cursor", "codex"]);
export type Source = z.infer<typeof Source>;

/**
 * Upstream model vendor. `cursor` covers their composer estimate-pricing path.
 * `unknown` is a fallback so the API never has to throw on a future source.
 */
export const Provider = z.enum(["anthropic", "openai", "cursor", "unknown"]);
export type Provider = z.infer<typeof Provider>;

/**
 * A single AI coding session reported by the CLI. Counts only — no prompt or
 * completion content is ever included in this record.
 *
 * `dedupeKey` is computed by the parser as a stable hash of
 * `(source, startedAt, model, inTokens, outTokens)` so re-syncing the same
 * logs is idempotent at the API layer.
 *
 * `provider` and the cache/reasoning token fields are optional for
 * backwards-compat: older CLI versions don't send them, and the API will
 * derive `provider` from `source` (claude-code → anthropic, codex → openai,
 * cursor → cursor) and treat the missing token kinds as zero.
 */
export const SessionRecord = z.object({
  id: z.string().min(1),
  source: Source,
  provider: Provider.optional(),
  model: z.string().min(1),
  inTokens: z.number().int().nonnegative(),
  outTokens: z.number().int().nonnegative(),
  /** Anthropic cache reads / OpenAI `cached_input_tokens`. Billed cheap-or-free. */
  cacheReadTokens: z.number().int().nonnegative().optional(),
  /** Anthropic cache creation tokens. Billed at a premium for first-write only. */
  cacheWriteTokens: z.number().int().nonnegative().optional(),
  /** OpenAI reasoning output tokens (o-series / Codex). Billed at output rate. */
  reasoningTokens: z.number().int().nonnegative().optional(),
  costUsdCents: z.number().int().nonnegative(),
  startedAt: z.number().int().positive(),
  endedAt: z.number().int().positive(),
  dedupeKey: z.string().min(1),
});
export type SessionRecord = z.infer<typeof SessionRecord>;

/**
 * Map a `Source` to its default `Provider`. The API uses this when an older
 * CLI sends a SessionRecord without an explicit `provider`.
 */
export function defaultProviderForSource(source: Source): Provider {
  switch (source) {
    case "claude-code":
      return "anthropic";
    case "codex":
      return "openai";
    case "cursor":
      return "cursor";
  }
}
