import { z } from "zod";

/**
 * v1.2 Track AA / v1.1 Track X — waitlist topics.
 *
 * - `"orgs"` — soft-create org waitlist (auto-inserted by `POST /v1/orgs` for pending orgs).
 * - `"provider:<id>"` — user submitted from the source-picker tree for a provider we don't yet track.
 *   IDs are kebab-case (e.g. `provider:vscode`, `provider:gemini-cli`, `provider:other`).
 */
export const WaitlistTopic = z
  .string()
  .min(1)
  .max(64)
  .regex(/^(orgs|provider:[a-z0-9-]+)$/);
export type WaitlistTopic = z.infer<typeof WaitlistTopic>;

export const CreateWaitlistRequest = z.object({
  topic: WaitlistTopic,
  email: z.string().email(),
  githubLogin: z.string().max(50).optional(),
  note: z.string().max(500).optional(),
});
export type CreateWaitlistRequest = z.infer<typeof CreateWaitlistRequest>;

export const CreateWaitlistResponse = z.object({
  ok: z.literal(true),
  /** 1-indexed position at insert time within the topic. Idempotent on (topic, email). */
  position: z.number().int().positive(),
});
export type CreateWaitlistResponse = z.infer<typeof CreateWaitlistResponse>;

export const WaitlistEntry = z.object({
  id: z.string(),
  topic: WaitlistTopic,
  email: z.string().email(),
  githubLogin: z.string().nullable(),
  note: z.string().nullable(),
  createdAt: z.number().int().positive(),
});
export type WaitlistEntry = z.infer<typeof WaitlistEntry>;

export const ListWaitlistResponse = z.object({
  entries: z.array(WaitlistEntry),
  /** Total rows for the topic, regardless of pagination. */
  total: z.number().int().nonnegative(),
});
export type ListWaitlistResponse = z.infer<typeof ListWaitlistResponse>;
