import { z } from "zod";
import { Leaderboard, LeaderboardRange } from "./leaderboard.js";
import { AutobiographyStats, Profile, User } from "./user.js";
import { Room, RoomCode, RoomMember } from "./room.js";
import { SessionRecord } from "./session.js";
import {
  ActivityRow,
  Challenge,
  ChallengeKind,
  ChallengeWithLeaderboard,
  StreakRow,
} from "./streaks.js";
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
  authGithubStart: "/v1/auth/github/start",
  authGithubCallback: "/v1/auth/github/callback",
  authCliExchange: "/v1/auth/cli/exchange",
  authCliPoll: "/v1/auth/cli/poll",
  // Phase 2 Track G+H
  meRooms: "/v1/me/rooms",
  leaveRoom: (code: RoomCode) => `/v1/rooms/${code}/leave`,
  renameRoom: (code: RoomCode) => `/v1/rooms/${code}`,
  roomActivity: (code: RoomCode) => `/v1/rooms/${code}/activity`,
  roomStreaks: (code: RoomCode) => `/v1/rooms/${code}/streaks`,
  roomChallenges: (code: RoomCode) => `/v1/rooms/${code}/challenges`,
  // Phase 2 Track K
  pushSubscriptions: "/v1/push/subscriptions",
  pushTest: "/v1/push/test",
  notificationPrefs: "/v1/notifications/preferences",
} as const;

// Re-export streak/challenge types for convenience
export type { ActivityRow, Challenge, ChallengeKind, ChallengeWithLeaderboard, StreakRow };
