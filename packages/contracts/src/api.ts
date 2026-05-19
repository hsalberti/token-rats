import { z } from "zod";
import { Leaderboard, LeaderboardRange, LeaderboardRow } from "./leaderboard.js";
import { ReferralStats } from "./referral.js";
import { Room, type RoomCode, RoomMember } from "./room.js";
import { SessionRecord } from "./session.js";
import {
  ActivityRow,
  Challenge,
  ChallengeKind,
  ChallengeWithLeaderboard,
  StreakRow,
} from "./streaks.js";
import { AutobiographyStats, Profile, PublicProfileSettings, User } from "./user.js";
export type {
  CreatePushSubscriptionRequest,
  CreatePushSubscriptionResponse,
  DeletePushSubscriptionResponse,
  PushTestResponse,
  NotificationPrefs,
  UpsertNotificationPrefsRequest,
  NotificationPrefsResponse,
  PushPayload,
} from "./notifications.js";
export type {
  Org,
  OrgMember,
  OrgMemberRole,
  OrgPlan,
  OrgSlug,
  OrgStatus,
  OrgInvite,
  OrgDashboard,
  OrgSpendByUser,
  OrgSpendByModel,
  OrgSpendByDay,
  CreateOrgResponse,
  GetOrgResponse,
  CreateOrgInviteResponse,
  AcceptOrgInviteResponse,
  GetOrgDashboardResponse,
  PatchOrgRequest,
  PatchOrgResponse,
  AdminPendingOrg,
  GetPendingOrgsResponse,
  ApproveOrgResponse,
} from "./org.js";
export {
  CreateOrgRequest,
  CreateOrgInviteRequest,
} from "./org.js";

/* ------------------------------- GET /v1/me ------------------------------ */
export const GetMeResponse = z.object({ user: User });
export type GetMeResponse = z.infer<typeof GetMeResponse>;

/* --------------------------- POST /v1/sessions --------------------------- */
export const UploadSessionsRequest = z.object({
  sessions: z.array(SessionRecord).max(1000),
});
export type UploadSessionsRequest = z.infer<typeof UploadSessionsRequest>;

export const UploadSessionsResponse = z.object({
  accepted: z.number().int().nonnegative(),
  duplicates: z.number().int().nonnegative(),
});
export type UploadSessionsResponse = z.infer<typeof UploadSessionsResponse>;

/* ----------------------------- POST /v1/rooms ---------------------------- */
export const CreateRoomRequest = z.object({
  name: z.string().min(1).max(64),
  /** v1.2: when true the room is publicly listed in /groups for its country. */
  isPublic: z.boolean().default(false),
});
export type CreateRoomRequest = z.infer<typeof CreateRoomRequest>;

export const CreateRoomResponse = z.object({ room: Room });
export type CreateRoomResponse = z.infer<typeof CreateRoomResponse>;

/* ------------------------ POST /v1/rooms/:code/join ---------------------- */
export const JoinRoomResponse = z.object({ room: Room });
export type JoinRoomResponse = z.infer<typeof JoinRoomResponse>;

/* ------------------------------- GET /v1/rooms/:code --------------------- */
export const GetRoomResponse = z.object({
  room: Room,
  members: z.array(RoomMember),
});
export type GetRoomResponse = z.infer<typeof GetRoomResponse>;

/* --------------------- GET /v1/rooms/:code/leaderboard ------------------- */
export const GetLeaderboardQuery = z.object({
  range: LeaderboardRange.default("today"),
});
export type GetLeaderboardQuery = z.infer<typeof GetLeaderboardQuery>;

export const GetLeaderboardResponse = z.object({ leaderboard: Leaderboard });
export type GetLeaderboardResponse = z.infer<typeof GetLeaderboardResponse>;

/* ----------------------------- GET /v1/u/:handle ------------------------- */
export const GetProfileResponse = z.object({ profile: Profile });
export type GetProfileResponse = z.infer<typeof GetProfileResponse>;

/* ------------------- GET /v1/u/:handle/autobiography -------------------- */
export const GetAutobiographyResponse = z.object({ autobiography: AutobiographyStats });
export type GetAutobiographyResponse = z.infer<typeof GetAutobiographyResponse>;

/* ---------------------- GET /v1/u/:handle/heatmap ----------------------- */
export const HeatmapDay = z.object({
  day: z.string(), // YYYY-MM-DD UTC
  tokens: z.number().int().nonnegative(),
  sessions: z.number().int().nonnegative(),
});
export type HeatmapDay = z.infer<typeof HeatmapDay>;

/** Range for heatmap queries — 30d is the default everywhere. */
export const HeatmapRange = z.enum(["30d", "52w"]);
export type HeatmapRange = z.infer<typeof HeatmapRange>;

export const Heatmap = z.object({
  range: HeatmapRange,
  from: z.string(), // YYYY-MM-DD UTC, inclusive
  to: z.string(), // YYYY-MM-DD UTC, inclusive
  days: z.array(HeatmapDay),
});
export type Heatmap = z.infer<typeof Heatmap>;

export const GetHeatmapQuery = z.object({
  range: HeatmapRange.default("30d"),
});
export type GetHeatmapQuery = z.infer<typeof GetHeatmapQuery>;

export const GetHeatmapResponse = z.object({ heatmap: Heatmap });
export type GetHeatmapResponse = z.infer<typeof GetHeatmapResponse>;

/* ---------------- GET /v1/r/:code/summary ------------------------------- */
/**
 * Lightweight public-facing room aggregate. Returned without auth — the
 * member count + 30-day token + 30-day cost totals are intentionally visible
 * to anyone with the room URL.
 */
export const RoomSummary = z.object({
  code: z.string(),
  name: z.string(),
  /** Future: true once feature #6 lands. Always false for now. */
  isPublic: z.boolean(),
  /** ISO country code (e.g. "DE") when isPublic is true; null otherwise. */
  country: z.string().nullable(),
  memberCount: z.number().int().nonnegative(),
  total30dTokens: z.number().int().nonnegative(),
  total30dCostUsdCents: z.number().int().nonnegative(),
});
export type RoomSummary = z.infer<typeof RoomSummary>;

export const GetRoomSummaryResponse = z.object({ summary: RoomSummary });
export type GetRoomSummaryResponse = z.infer<typeof GetRoomSummaryResponse>;

/* ---------------- GET /v1/groups ---------------------------------------- */
/**
 * Lists up to 50 public rooms in the viewer's `cf-ipcountry`. Auth optional;
 * signed-out viewers see the same list but with the join button replaced by
 * a sign-in CTA on the web side.
 */
export const PublicGroupRow = z.object({
  code: z.string(),
  name: z.string(),
  country: z.string().min(2).max(2),
  memberCount: z.number().int().nonnegative(),
  total30dTokens: z.number().int().nonnegative(),
  total30dCostUsdCents: z.number().int().nonnegative(),
});
export type PublicGroupRow = z.infer<typeof PublicGroupRow>;

/** One row on the country board — a public user ranked by trailing-30d tokens. */
export const CountryBoardRow = z.object({
  rank: z.number().int().positive(),
  userId: z.string(),
  handle: z.string(),
  avatarUrl: z.string().url().nullable(),
  tokens: z.number().int().nonnegative(),
  costUsdCents: z.number().int().nonnegative(),
  sessions: z.number().int().nonnegative(),
});
export type CountryBoardRow = z.infer<typeof CountryBoardRow>;

export const GetGroupsResponse = z.object({
  country: z.string().min(2).max(2).nullable(),
  groups: z.array(PublicGroupRow),
  /** Public users in the viewer's country, ranked by trailing-30d tokens. */
  userBoard: z.array(CountryBoardRow),
});
export type GetGroupsResponse = z.infer<typeof GetGroupsResponse>;

/* ---------------- GET /v1/r/:code/group-streak -------------------------- */
/**
 * The number of consecutive UTC days (counting back from yesterday) on which
 * at least one room member had `daily_rollup.tokens > 0`. Today (in progress)
 * does not count.
 */
export const GroupStreak = z.object({
  currentStreak: z.number().int().nonnegative(),
  /** Yesterday in YYYY-MM-DD UTC. */
  asOf: z.string(),
});
export type GroupStreak = z.infer<typeof GroupStreak>;

export const GetGroupStreakResponse = z.object({ groupStreak: GroupStreak });
export type GetGroupStreakResponse = z.infer<typeof GetGroupStreakResponse>;

/* -------------------- Phase 2 Track G+H new endpoints -------------------- */

/* GET /v1/me/rooms */
export const GetMyRoomsResponse = z.object({
  rooms: z.array(Room),
});
export type GetMyRoomsResponse = z.infer<typeof GetMyRoomsResponse>;

/* POST /v1/rooms/:code/leave */
export const LeaveRoomResponse = z.object({ ok: z.boolean() });
export type LeaveRoomResponse = z.infer<typeof LeaveRoomResponse>;

/* PATCH /v1/rooms/:code  (owner only — rename) */
export const RenameRoomRequest = z.object({
  name: z.string().min(1).max(64),
});
export type RenameRoomRequest = z.infer<typeof RenameRoomRequest>;

export const RenameRoomResponse = z.object({ room: Room });
export type RenameRoomResponse = z.infer<typeof RenameRoomResponse>;

/* GET /v1/rooms/:code/activity?limit=20 */
export const GetActivityQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type GetActivityQuery = z.infer<typeof GetActivityQuery>;

export const GetActivityResponse = z.object({
  activity: z.array(ActivityRow),
});
export type GetActivityResponse = z.infer<typeof GetActivityResponse>;

/* GET /v1/rooms/:code/streaks */
export const GetStreaksResponse = z.object({
  streaks: z.array(StreakRow),
});
export type GetStreaksResponse = z.infer<typeof GetStreaksResponse>;

/* POST /v1/rooms/:code/challenges */
export const CreateChallengeRequest = z.object({
  kind: ChallengeKind,
  durationDays: z.number().int().min(1).max(90),
});
export type CreateChallengeRequest = z.infer<typeof CreateChallengeRequest>;

export const CreateChallengeResponse = z.object({ challenge: Challenge });
export type CreateChallengeResponse = z.infer<typeof CreateChallengeResponse>;

/* GET /v1/rooms/:code/challenges */
export const GetChallengesResponse = z.object({
  active: z.array(ChallengeWithLeaderboard),
  past: z.array(ChallengeWithLeaderboard),
});
export type GetChallengesResponse = z.infer<typeof GetChallengesResponse>;

/* --------------------------- PATCH /v1/me -------------------------------- */
export const PatchMeRequest = PublicProfileSettings;
export type PatchMeRequest = z.infer<typeof PatchMeRequest>;

export const PatchMeResponse = z.object({ user: User });
export type PatchMeResponse = z.infer<typeof PatchMeResponse>;

/* ---------------------- GET /v1/trending --------------------------------- */
export const GetTrendingQuery = z.object({
  range: LeaderboardRange.default("today"),
});
export type GetTrendingQuery = z.infer<typeof GetTrendingQuery>;

export const GetTrendingResponse = z.object({
  rows: z.array(LeaderboardRow),
  range: LeaderboardRange,
  generatedAt: z.number().int().positive(),
});
export type GetTrendingResponse = z.infer<typeof GetTrendingResponse>;

/* ------------------------- GET /v1/me/referral --------------------------- */
export const GetReferralResponse = z.object({ referral: ReferralStats });
export type GetReferralResponse = z.infer<typeof GetReferralResponse>;

/* -------------------- POST /v1/abuse/report ------------------------------ */
export const ReportAbuseRequest = z.object({
  targetHandle: z.string().min(1).max(100),
  reason: z.string().min(1).max(500),
});
export type ReportAbuseRequest = z.infer<typeof ReportAbuseRequest>;

export const ReportAbuseResponse = z.object({ ok: z.boolean() });
export type ReportAbuseResponse = z.infer<typeof ReportAbuseResponse>;

/* ----------------------------- Endpoint catalog -------------------------- */
/** Single source of truth for v1 endpoint paths. */
export const ENDPOINTS = {
  me: "/v1/me",
  sessions: "/v1/sessions",
  rooms: "/v1/rooms",
  room: (code: RoomCode) => `/v1/rooms/${code}`,
  joinRoom: (code: RoomCode) => `/v1/rooms/${code}/join`,
  leaderboard: (code: RoomCode) => `/v1/rooms/${code}/leaderboard`,
  profile: (handle: string) => `/v1/u/${handle}`,
  autobiography: (handle: string) => `/v1/u/${handle}/autobiography`,
  profileHeatmap: (handle: string) => `/v1/u/${handle}/heatmap`,
  // v1.2 room aggregates — auth optional, accessible to non-members.
  roomSummary: (code: RoomCode) => `/v1/r/${code}/summary`,
  roomHeatmap: (code: RoomCode) => `/v1/r/${code}/heatmap`,
  roomGroupStreak: (code: RoomCode) => `/v1/r/${code}/group-streak`,
  // v1.2 public country-locked groups list
  groups: "/v1/groups",
  authGithubStart: "/v1/auth/github/start",
  authGithubCallback: "/v1/auth/github/callback",
  authLogout: "/v1/auth/logout",
  authCliExchange: "/v1/auth/cli/exchange",
  authCliPoll: "/v1/auth/cli/poll",
  // Phase 2 Track G+H
  meRooms: "/v1/me/rooms",
  leaveRoom: (code: RoomCode) => `/v1/rooms/${code}/leave`,
  renameRoom: (code: RoomCode) => `/v1/rooms/${code}`,
  pinRoom: (code: RoomCode) => `/v1/rooms/${code}/pin`,
  roomActivity: (code: RoomCode) => `/v1/rooms/${code}/activity`,
  roomStreaks: (code: RoomCode) => `/v1/rooms/${code}/streaks`,
  roomChallenges: (code: RoomCode) => `/v1/rooms/${code}/challenges`,
  // Phase 2 Track K
  pushSubscriptions: "/v1/push/subscriptions",
  pushTest: "/v1/push/test",
  notificationPrefs: "/v1/notifications/preferences",
  // Phase 3 Track L
  roomLive: (code: RoomCode) => `/v1/rooms/${code}/live`,
  // Phase 3 Track N
  patchMe: "/v1/me",
  trending: "/v1/trending",
  reportAbuse: "/v1/abuse/report",
  // Affiliate / referral tracking
  meReferral: "/v1/me/referral",
  // v1.2 Track AD — friends derived from shared private rooms
  meFriends: "/v1/me/friends",
  // Phase 3 Track O — Org plan
  orgs: "/v1/orgs",
  org: (slug: string) => `/v1/orgs/${slug}`,
  orgInvites: (slug: string) => `/v1/orgs/${slug}/invites`,
  orgAccept: (slug: string) => `/v1/orgs/${slug}/accept`,
  orgDashboard: (slug: string) => `/v1/orgs/${slug}/dashboard`,
  stripeWebhook: "/webhooks/stripe",
  // Phase 3 Track M
  proxyAnthropicMessages: "/v1/proxy/anthropic/v1/messages",
  proxyAnthropicKey: "/v1/proxy/keys/anthropic",
  // Admin analytics (project-owner only)
  adminSignups: "/v1/admin/signups",
  adminActivity: "/v1/admin/activity",
  adminReferrers: "/v1/admin/referrers",
  // Admin org approval (v1.2)
  adminOrgsPending: "/v1/admin/orgs/pending",
  adminOrgApprove: (slug: string) => `/v1/admin/orgs/${slug}/approve`,
} as const;

// Re-export streak/challenge types for convenience
export type { ActivityRow, Challenge, ChallengeKind, ChallengeWithLeaderboard, StreakRow };
// Re-export user/profile types for convenience
export type { PublicProfileSettings };
