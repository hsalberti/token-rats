import { z } from "zod";

const ProfileAttributionEntry = z.object({
  source: z.string(),
  tokens: z.number().int().nonnegative(),
  costUsdCents: z.number().int().nonnegative(),
  sessions: z.number().int().nonnegative(),
});

export const GithubProject = z
  .object({
    name: z.string().min(1).max(100),
    fullName: z
      .string()
      .min(3)
      .max(201)
      .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
    url: z.string().url().startsWith("https://github.com/"),
    description: z.string().max(500).nullable(),
  })
  .superRefine((project, context) => {
    const repositoryName = project.fullName.split("/")[1];
    const canonicalUrl = `https://github.com/${project.fullName}`;
    if (repositoryName?.toLowerCase() !== project.name.toLowerCase()) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "GitHub project name is invalid" });
    }
    if (project.url.toLowerCase() !== canonicalUrl.toLowerCase()) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "GitHub project URL is invalid" });
    }
  });
export type GithubProject = z.infer<typeof GithubProject>;

const GithubProjects = z
  .array(GithubProject)
  .max(3)
  .refine(
    (projects) =>
      new Set(projects.map((project) => project.fullName.toLowerCase())).size === projects.length,
    {
      message: "GitHub projects must be unique",
    },
  );

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
  /** Full text is self-only; public profiles receive agentInstructionsPreview instead. */
  agentInstructions: z.string().max(20_000).nullable().optional(),
  githubProjects: GithubProjects.optional(),
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
  agentInstructions: z.string().max(20_000).nullable().optional(),
  githubProjects: GithubProjects.optional(),
});
export type PublicProfileSettings = z.infer<typeof PublicProfileSettings>;

export const Profile = User.extend({
  /** The first ten lines of the owner's saved agent instructions. */
  agentInstructionsPreview: z.string().max(4_000).nullable().optional(),
  totals: z.object({
    today: z.object({ tokens: z.number().int(), costUsdCents: z.number().int() }),
    week: z.object({ tokens: z.number().int(), costUsdCents: z.number().int() }),
    allTime: z.object({ tokens: z.number().int(), costUsdCents: z.number().int() }),
  }),
  /** Number of users this user has brought in via their referral link. */
  referredCount: z.number().int().nonnegative().optional(),
  /** All-time attribution grouped by tool/client. */
  sources: z.array(ProfileAttributionEntry).optional(),
  /** All-time attribution grouped by transport channel. */
  channels: z.array(ProfileAttributionEntry).optional(),
  /**
   * The profile owner's referral code. Self-only — present only when the
   * caller is viewing their own profile, so the page can render a
   * copy-able invite link without a separate fetch to /v1/me/referral.
   */
  referralCode: z.string().optional(),
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
