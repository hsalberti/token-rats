import { z } from "zod";
import { Leaderboard, LeaderboardRange } from "./leaderboard.js";
import { Profile, User } from "./user.js";
import { Room, RoomCode, RoomMember } from "./room.js";
import { SessionRecord } from "./session.js";

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
  authGithubStart: "/v1/auth/github/start",
  authGithubCallback: "/v1/auth/github/callback",
  authCliExchange: "/v1/auth/cli/exchange",
  authCliPoll: "/v1/auth/cli/poll",
} as const;
