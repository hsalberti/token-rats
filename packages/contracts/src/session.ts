import { z } from "zod";

export const Source = z.enum(["claude-code", "cursor"]);
export type Source = z.infer<typeof Source>;

/**
 * A single AI coding session reported by the CLI. Counts only — no prompt or
 * completion content is ever included in this record.
 *
 * `dedupeKey` is computed by the parser as a stable hash of
 * `(source, startedAt, model, inTokens, outTokens)` so re-syncing the same
 * logs is idempotent at the API layer.
 */
export const SessionRecord = z.object({
  id: z.string().min(1),
  source: Source,
  model: z.string().min(1),
  inTokens: z.number().int().nonnegative(),
  outTokens: z.number().int().nonnegative(),
  costUsdCents: z.number().int().nonnegative(),
  startedAt: z.number().int().positive(),
  endedAt: z.number().int().positive(),
  dedupeKey: z.string().min(1),
});
export type SessionRecord = z.infer<typeof SessionRecord>;
