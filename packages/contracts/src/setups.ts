import { z } from "zod";

export const SetupBundle = z
  .object({
    files: z
      .array(
        z.object({
          name: z
            .string()
            .min(1)
            .max(100)
            .regex(/^[\w. -]+$/),
          content: z.string().max(20_000),
        }),
      )
      .min(1)
      .max(10),
    workflow: z.string().max(5_000).default(""),
    tools: z.string().max(2_000).default(""),
    models: z.string().max(2_000).default(""),
    subscriptions: z.string().max(2_000).default(""),
  })
  .superRefine((v, ctx) => {
    if (new Set(v.files.map((f) => f.name)).size !== v.files.length)
      ctx.addIssue({ code: "custom", message: "File names must be unique" });
    if (v.files.reduce((n, f) => n + f.content.length, 0) > 100_000)
      ctx.addIssue({ code: "custom", message: "Keep each setup under 100,000 characters" });
  });
export type SetupBundle = z.infer<typeof SetupBundle>;
export const SetupVerdict = z.enum(["experiment", "using", "retired"]);
export const SaveSetupVersion = z.object({
  name: z.string().trim().min(1).max(100),
  bundle: SetupBundle,
  note: z.string().max(2_000).default(""),
  verdict: SetupVerdict.default("experiment"),
  publish: z.boolean().default(false),
  baseVersionId: z.string().nullable().default(null),
});
export type SaveSetupVersion = z.infer<typeof SaveSetupVersion>;
export const ShelfStatus = z.enum(["want_to_try", "trying", "using", "tried", "dropped"]);
export type ShelfStatus = z.infer<typeof ShelfStatus>;
export const SetupReview = z
  .object({
    status: ShelfStatus,
    stars: z.number().int().min(1).max(5).nullable().default(null),
    note: z.string().max(500).default(""),
  })
  .refine(
    (v) => !v.stars || !["want_to_try", "trying"].includes(v.status),
    "Rate a setup after you have tried it",
  );
export type SetupReview = z.infer<typeof SetupReview>;
export interface SetupVersion {
  id: string;
  setupId: string;
  name: string;
  number: number;
  ownerId: string;
  handle: string;
  avatarUrl: string | null;
  bundle: SetupBundle;
  note: string;
  verdict: z.infer<typeof SetupVerdict>;
  createdAt: number;
  publishedAt: number | null;
  featured: boolean;
  originVersionId: string | null;
  averageRating: number | null;
  ratingCount: number;
}
export interface SetupReviewRow extends SetupReview {
  userId: string;
  handle: string;
  updatedAt: number;
}
export interface SetupDetail {
  version: SetupVersion;
  history: SetupVersion[];
  reviews: SetupReviewRow[];
  mine: SetupReview | null;
  following: boolean;
  isOwner: boolean;
}
export interface SetupFeed {
  versions: SetupVersion[];
  nextCursor: string | null;
}
export interface SocialPrefs {
  setupEmails: boolean;
  milestoneEmails: boolean;
  inApp: boolean;
  shareMilestones: boolean;
}
export interface SocialNotice {
  id: string;
  title: string;
  href: string;
  createdAt: number;
  readAt: number | null;
  kind: "setup" | "milestone";
}
