import { z } from "zod";

export const Source = z.enum(["claude-code", "cursor", "codex", "openrouter", "openai"]);
export type Source = z.infer<typeof Source>;

/**
 * Upstream model vendor. `cursor` covers their composer estimate-pricing path.
 * `unknown` is a fallback so the API never has to throw on a future source.
 */
export const Provider = z.enum([
  "anthropic",
  "openai",
  "openrouter",
  "cursor",
  "ollama",
  "unknown",
]);
export type Provider = z.infer<typeof Provider>;

/**
 * Which surface produced the session. This is intentionally broader than the
 * coarse `source` field so we can distinguish, for example, `codex-cli` from a
 * future non-CLI Codex surface without breaking historical aggregates.
 */
export const SessionChannel = z.enum(["cli", "ide", "api", "proxy", "local", "unknown"]);
export type SessionChannel = z.infer<typeof SessionChannel>;

/**
 * A single AI coding session reported by the CLI. Counts only — no prompt or
 * completion content is ever included in this record.
 *
 * The CLI computes `dedupeKey` with SHA-256 over the record identity, model,
 * timestamp, and token counts. Repeated uploads are idempotent. Pure parser
 * callers receive a provisional count hash.
 *
 * `provider` and the cache/reasoning token fields are optional for
 * backwards-compat: older CLI versions don't send them, and the API will
 * derive `provider` from `source` (claude-code → anthropic, codex → openai,
 * cursor → cursor) and treat the missing token kinds as zero.
 *
 * `client` and `channel` are also optional for backwards-compat. These let us
 * distinguish the tool that emitted the usage (`claude-code`, `codex-cli`,
 * `openclaw`, `token-rats-proxy`, …) from the broader `source` bucket and the
 * transport (`cli`, `proxy`, `api`, `local`, …).
 */
/**
 * Charsets for the free-text identifier fields. Kept deliberately permissive
 * to cover every shape the parsers emit today — `id` is `"<source>:<uuid>"`,
 * `model` includes vendor slugs like `anthropic/claude-opus-4.7`, `dedupeKey`
 * is an FNV-1a hex digest, `client` is a tool slug — while still rejecting
 * control characters and unbounded blobs that could poison D1 / logs.
 */
const ID_RE = /^[A-Za-z0-9._:/+ -]+$/;
const MODEL_RE = /^[A-Za-z0-9._:/+ -]+$/;
const DEDUPE_KEY_RE = /^[A-Za-z0-9._:-]+$/;
const CLIENT_RE = /^[A-Za-z0-9._-]+$/;

export const SessionRecord = z.object({
  accountingVersion: z.literal(2).optional(),
  id: z.string().min(1).max(256).regex(ID_RE),
  source: Source,
  provider: Provider.optional(),
  client: z.string().min(1).max(64).regex(CLIENT_RE).optional(),
  channel: SessionChannel.optional(),
  model: z.string().min(1).max(128).regex(MODEL_RE),
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
  dedupeKey: z.string().min(1).max(128).regex(DEDUPE_KEY_RE),
});
export type SessionRecord = z.infer<typeof SessionRecord>;

/**
 * Map a `Source` to its default `Provider`. The API uses this when an older
 * CLI sends a SessionRecord without an explicit `provider`.
 */
export function defaultProviderForSource(source: Source): Provider {
  switch (source) {
    case "openrouter":
      return "openrouter";
    case "openai":
      return "openai";
    case "claude-code":
      return "anthropic";
    case "codex":
      return "openai";
    case "cursor":
      return "cursor";
  }
}

export function defaultClientForSource(source: Source): string {
  switch (source) {
    case "openrouter":
      return "openrouter";
    case "openai":
      return "openai";
    case "claude-code":
      return "claude-code";
    case "codex":
      return "codex-cli";
    case "cursor":
      return "cursor";
  }
}

export function defaultChannelForSource(source: Source): SessionChannel {
  switch (source) {
    case "openrouter":
    case "openai":
      return "api";
    case "claude-code":
      return "cli";
    case "codex":
      return "cli";
    case "cursor":
      return "ide";
  }
}
