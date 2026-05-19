import { z } from "zod";

/* -------------------------------------------------------------------------- */
/* Org plan                                                                    */
/* -------------------------------------------------------------------------- */

export const OrgPlan = z.enum(["free", "pro", "student"]);
export type OrgPlan = z.infer<typeof OrgPlan>;

/** v1.2 Track AA — `pending` orgs are reserved but not yet usable. */
export const OrgStatus = z.enum(["active", "pending"]);
export type OrgStatus = z.infer<typeof OrgStatus>;

export const OrgMemberRole = z.enum(["owner", "admin", "member"]);
export type OrgMemberRole = z.infer<typeof OrgMemberRole>;

/** Slug: lowercase letters, numbers, and hyphens, 3–48 chars. */
export const OrgSlug = z
  .string()
  .min(3)
  .max(48)
  .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only");
export type OrgSlug = z.infer<typeof OrgSlug>;

export const Org = z.object({
  id: z.string(),
  name: z.string().min(1).max(64),
  slug: OrgSlug.nullable(),
  plan: OrgPlan,
  seatCount: z.number().int().nonnegative(),
  githubOrgLogin: z.string().nullable(),
  createdAt: z.number().int().positive(),
  /** v1.2 Track AA — defaults to `active` for orgs created before this column landed. */
  status: OrgStatus.default("active"),
});
export type Org = z.infer<typeof Org>;

export const OrgMember = z.object({
  userId: z.string(),
  handle: z.string(),
  avatarUrl: z.string().url().nullable(),
  role: OrgMemberRole,
});
export type OrgMember = z.infer<typeof OrgMember>;

export const OrgInvite = z.object({
  id: z.string(),
  orgId: z.string(),
  email: z.string().email().nullable(),
  githubLogin: z.string().nullable(),
  invitedBy: z.string(),
  createdAt: z.number().int().positive(),
  acceptedAt: z.number().int().positive().nullable(),
});
export type OrgInvite = z.infer<typeof OrgInvite>;

/* -------------------------------------------------------------------------- */
/* Org dashboard types                                                         */
/* -------------------------------------------------------------------------- */

export const OrgSpendByUser = z.object({
  userId: z.string(),
  handle: z.string(),
  avatarUrl: z.string().url().nullable(),
  tokens: z.number().int().nonnegative(),
  costUsdCents: z.number().int().nonnegative(),
});
export type OrgSpendByUser = z.infer<typeof OrgSpendByUser>;

export const OrgSpendByModel = z.object({
  model: z.string(),
  tokens: z.number().int().nonnegative(),
  costUsdCents: z.number().int().nonnegative(),
});
export type OrgSpendByModel = z.infer<typeof OrgSpendByModel>;

export const OrgSpendByDay = z.object({
  day: z.string(), // YYYY-MM-DD
  tokens: z.number().int().nonnegative(),
  costUsdCents: z.number().int().nonnegative(),
});
export type OrgSpendByDay = z.infer<typeof OrgSpendByDay>;

export const OrgDashboard = z.object({
  spendByUser: z.array(OrgSpendByUser), // top 50
  spendByModel: z.array(OrgSpendByModel),
  spendByDay: z.array(OrgSpendByDay), // last 30d
});
export type OrgDashboard = z.infer<typeof OrgDashboard>;

/* -------------------------------------------------------------------------- */
/* Request / response shapes                                                   */
/* -------------------------------------------------------------------------- */

export const CreateOrgRequest = z.object({
  name: z.string().min(1).max(64),
  slug: OrgSlug,
  githubOrgLogin: z.string().optional(),
  /** v1.2 Track AA — when true, the org is created with plan='student' and status='pending'. */
  student: z.boolean().optional(),
  /** v1.2 Track AA — free-text university or org context, persisted to waitlists payload. */
  university: z.string().max(200).optional(),
  /** v1.2 Track AA — free-text "why us" note, persisted to waitlists payload. */
  note: z.string().max(500).optional(),
});
export type CreateOrgRequest = z.infer<typeof CreateOrgRequest>;

export const CreateOrgResponse = z.object({
  org: Org,
  /** v1.2 Track AA — present when status='pending'; 1-indexed queue position at insert time. */
  waitlistPosition: z.number().int().positive().optional(),
});
export type CreateOrgResponse = z.infer<typeof CreateOrgResponse>;

/** v1.2 Track AA — admin queue listing. */
export const PendingOrgRow = z.object({
  org: Org,
  founderHandle: z.string(),
  university: z.string().nullable(),
  note: z.string().nullable(),
  createdAt: z.number().int().positive(),
});
export type PendingOrgRow = z.infer<typeof PendingOrgRow>;

export const PendingOrgsResponse = z.object({ pending: z.array(PendingOrgRow) });
export type PendingOrgsResponse = z.infer<typeof PendingOrgsResponse>;

export const ApproveOrgRequest = z.object({
  /** Optional override of the plan tier at approval time. */
  plan: OrgPlan.optional(),
});
export type ApproveOrgRequest = z.infer<typeof ApproveOrgRequest>;

export const ApproveOrgResponse = z.object({ org: Org });
export type ApproveOrgResponse = z.infer<typeof ApproveOrgResponse>;

export const GetOrgResponse = z.object({
  org: Org,
  members: z.array(OrgMember),
});
export type GetOrgResponse = z.infer<typeof GetOrgResponse>;

export const CreateOrgInviteRequest = z
  .object({
    email: z.string().email().optional(),
    githubLogin: z.string().optional(),
  })
  .refine((d) => d.email || d.githubLogin, {
    message: "Either email or githubLogin is required",
  });
export type CreateOrgInviteRequest = z.infer<typeof CreateOrgInviteRequest>;

export const CreateOrgInviteResponse = z.object({ invite: OrgInvite });
export type CreateOrgInviteResponse = z.infer<typeof CreateOrgInviteResponse>;

export const AcceptOrgInviteResponse = z.object({ ok: z.boolean() });
export type AcceptOrgInviteResponse = z.infer<typeof AcceptOrgInviteResponse>;

export const GetOrgDashboardResponse = z.object({ dashboard: OrgDashboard });
export type GetOrgDashboardResponse = z.infer<typeof GetOrgDashboardResponse>;
