import { z } from "zod";

export const User = z.object({
  id: z.string(),
  handle: z.string(),
  avatarUrl: z.string().url().nullable(),
  /** Present only when the caller is the user themselves or the user is public. */
  bio: z.string().max(200).nullable().optional(),
  twitterHandle: z.string().max(50).nullable().optional(),
  /**
   * True iff `twitter_handle` came from the OAuth flow (i.e. `twitter_user_id`
   * is set). Self-only — used by settings UI to distinguish manual legacy
   * handles from verified ones.
   */
  twitterVerified: z.boolean().optional(),
  publicProfile: z.boolean().optional(),
  /**
   * Primary verified GitHub email, captured at OAuth callback time. Self-only
   * (other readers never see this field). `null` when GitHub didn't return a
   * verified email — the user sees a banner asking them to add one.
   */
  email: z.string().email().nullable().optional(),
});
export type User = z.infer<typeof User>;

/**
 * Settings for making a profile public and editing discovery fields.
 *
 * `twitterHandle` is intentionally NOT here — verified handles flow only
 * through `/v1/auth/twitter/start` (OAuth); legacy manual entries are
 * left untouched. See feature #5 in roadmap.md.
 */
export const PublicProfileSettings = z.object({
  publicProfile: z.boolean().optional(),
  bio: z.string().max(200).nullable().optional(),
});
export type PublicProfileSettings = z.infer<typeof PublicProfileSettings>;

export const Profile = User.extend({
  totals: z.object({
    today: z.object({ tokens: z.number().int(), costUsdCents: z.number().int() }),
    week: z.object({ tokens: z.number().int(), costUsdCents: z.number().int() }),
    allTime: z.object({ tokens: z.number().int(), costUsdCents: z.number().int() }),
  }),
});
export type Profile = z.infer<typeof Profile>;

/** Richer stats powering the onboarding Token Autobiography flow. */
export const AutobiographyStats = z.object({
  handle: z.string(),
  avatarUrl: z.string().url().nullable(),
  /** Total tokens, all time */
  totalTokens: z.number().int(),
  /** Total cost, all time (USD cents) */
  totalCostUsdCents: z.number().int(),
  /** Tokens + cost for current month (calendar month, UTC) */
  monthTokens: z.number().int(),
  monthCostUsdCents: z.number().int(),
  /** Single session with the most tokens */
  biggestSessionTokens: z.number().int(),
  /** Model name used most across all sessions */
  dominantModel: z.string(),
  /** 0 = Sunday, 1 = Monday … 6 = Saturday */
  mostActiveDayOfWeek: z.number().int().min(0).max(6),
  /** Average synced sessions per day (days with ≥1 session) */
  sessionsPerDay: z.number(),
  /** Total number of distinct sessions */
  totalSessions: z.number().int(),
  /** First sync date YYYY-MM-DD */
  firstSyncDate: z.string().nullable(),
  /** Coffees-worth of compute this month ($5/cup) */
  monthlyCoffees: z.number(),
});
export type AutobiographyStats = z.infer<typeof AutobiographyStats>;
