import { z } from "zod";

/** A single user brought in via the signed-in user's referral link. */
export const ReferredUser = z.object({
  handle: z.string(),
  avatarUrl: z.string().url().nullable(),
  /** Unix ms — when the referred user signed up. */
  createdAt: z.number().int(),
});
export type ReferredUser = z.infer<typeof ReferredUser>;

/** The signed-in user's own referral code + who they've brought in so far. */
export const ReferralStats = z.object({
  /** The user's unique referral code (URL-safe, ~8 chars). */
  code: z.string(),
  /** Total users referred. */
  count: z.number().int().nonnegative(),
  /** Most recent referred users (newest first), capped server-side. */
  recent: z.array(ReferredUser),
});
export type ReferralStats = z.infer<typeof ReferralStats>;
