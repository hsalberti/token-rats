/**
 * Typed API client for the Token Rats Worker API.
 * Reads NEXT_PUBLIC_API_URL (default: https://api.tokenrats.com).
 *
 * Server components pass through the incoming request cookie via the
 * `cookieHeader` parameter. Client components omit it and rely on the
 * browser sending the __Host-tr_session cookie automatically.
 */

import type {
  CreateChallengeRequest,
  CreateChallengeResponse,
  CreateRoomRequest,
  CreateRoomResponse,
  GetActivityResponse,
  GetAutobiographyResponse,
  GetChallengesResponse,
  GetHeatmapResponse,
  GetLeaderboardResponse,
  GetMeResponse,
  GetMyRoomsResponse,
  GetProfileResponse,
  GetRoomResponse,
  GetStreaksResponse,
  GetTrendingResponse,
  JoinRoomResponse,
  LeaderboardRange,
  LeaveRoomResponse,
  NotificationPrefsResponse,
  PatchMeRequest,
  PatchMeResponse,
  ReportAbuseRequest,
  ReportAbuseResponse,
  RenameRoomRequest,
  RenameRoomResponse,
  RoomCode,
  UploadSessionsRequest,
  UploadSessionsResponse,
  UpsertNotificationPrefsRequest,
  // Phase 3 Track O — Org plan
  CreateOrgRequest,
  CreateOrgResponse,
  GetOrgResponse,
  CreateOrgInviteRequest,
  CreateOrgInviteResponse,
  AcceptOrgInviteResponse,
  GetOrgDashboardResponse,
} from "@token-rats/contracts";
import { ENDPOINTS } from "@token-rats/contracts";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.tokenrats.com";

/** Auth start URL — navigate the browser to this to kick off GitHub OAuth. */
export const AUTH_GITHUB_START = `${API_URL}${ENDPOINTS.authGithubStart}`;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { cookieHeader?: string } = {},
): Promise<T> {
  const { cookieHeader, ...fetchOptions } = options;
  const headers = new Headers(fetchOptions.headers);

  if (cookieHeader) {
    headers.set("Cookie", cookieHeader);
  }
  headers.set("Accept", "application/json");
  if (fetchOptions.body && typeof fetchOptions.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...fetchOptions,
    headers,
    credentials: "include",
  });

  if (!res.ok) {
    throw new ApiError(res.status, `API error: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<T>;
}

/** Fetch the currently signed-in user. */
export async function getMe(cookieHeader?: string): Promise<GetMeResponse> {
  return request<GetMeResponse>(ENDPOINTS.me, { cookieHeader });
}

/** Upload parsed sessions from the CLI. */
export async function uploadSessions(
  body: UploadSessionsRequest,
  cookieHeader?: string,
): Promise<UploadSessionsResponse> {
  return request<UploadSessionsResponse>(ENDPOINTS.sessions, {
    method: "POST",
    body: JSON.stringify(body),
    cookieHeader,
  });
}

/** Create a new room. */
export async function createRoom(
  body: CreateRoomRequest,
  cookieHeader?: string,
): Promise<CreateRoomResponse> {
  return request<CreateRoomResponse>(ENDPOINTS.rooms, {
    method: "POST",
    body: JSON.stringify(body),
    cookieHeader,
  });
}

/** Join a room by code. */
export async function joinRoom(code: RoomCode, cookieHeader?: string): Promise<JoinRoomResponse> {
  return request<JoinRoomResponse>(ENDPOINTS.joinRoom(code), {
    method: "POST",
    cookieHeader,
  });
}

/** Get room details and member list. */
export async function getRoom(code: RoomCode, cookieHeader?: string): Promise<GetRoomResponse> {
  return request<GetRoomResponse>(ENDPOINTS.room(code), { cookieHeader });
}

/** Get room leaderboard for a given time range. */
export async function getLeaderboard(
  code: RoomCode,
  range: LeaderboardRange = "today",
  cookieHeader?: string,
): Promise<GetLeaderboardResponse> {
  const url = `${ENDPOINTS.leaderboard(code)}?range=${range}`;
  return request<GetLeaderboardResponse>(url, { cookieHeader });
}

/** Get a user's public profile. */
export async function getProfile(
  handle: string,
  cookieHeader?: string,
): Promise<GetProfileResponse> {
  return request<GetProfileResponse>(ENDPOINTS.profile(handle), {
    cookieHeader,
  });
}

/** Get the Token Autobiography stats for a user. */
export async function getAutobiography(
  handle: string,
  cookieHeader?: string,
): Promise<GetAutobiographyResponse> {
  return request<GetAutobiographyResponse>(ENDPOINTS.autobiography(handle), {
    cookieHeader,
  });
}

/** Get the 364-day calendar heatmap for a user's public profile. */
export async function getHeatmap(
  handle: string,
  cookieHeader?: string,
): Promise<GetHeatmapResponse> {
  return request<GetHeatmapResponse>(ENDPOINTS.profileHeatmap(handle), {
    cookieHeader,
  });
}

/** Approve a pending CLI device code. */
export async function approveCli(code: string, cookieHeader?: string): Promise<void> {
  return request<void>("/v1/auth/cli/approve", {
    method: "POST",
    body: JSON.stringify({ verificationCode: code }),
    cookieHeader,
  });
}

// Track GH (Phase 2): new API functions for rooms polish + streaks/challenges

/** Get all rooms the authenticated user is a member of. */
export async function getMyRooms(cookieHeader?: string): Promise<GetMyRoomsResponse> {
  return request<GetMyRoomsResponse>(ENDPOINTS.meRooms, { cookieHeader });
}

/** Leave a room by code. */
export async function leaveRoom(
  code: RoomCode,
  cookieHeader?: string,
): Promise<LeaveRoomResponse> {
  return request<LeaveRoomResponse>(ENDPOINTS.leaveRoom(code), {
    method: "POST",
    cookieHeader,
  });
}

/** Rename a room (owner only). */
export async function renameRoom(
  code: RoomCode,
  body: RenameRoomRequest,
  cookieHeader?: string,
): Promise<RenameRoomResponse> {
  return request<RenameRoomResponse>(ENDPOINTS.renameRoom(code), {
    method: "PATCH",
    body: JSON.stringify(body),
    cookieHeader,
  });
}

/** Get recent activity feed for a room. */
export async function getRoomActivity(
  code: RoomCode,
  limit = 20,
  cookieHeader?: string,
): Promise<GetActivityResponse> {
  const url = `${ENDPOINTS.roomActivity(code)}?limit=${limit}`;
  return request<GetActivityResponse>(url, { cookieHeader });
}

/** Get per-user-per-room streaks. */
export async function getRoomStreaks(
  code: RoomCode,
  cookieHeader?: string,
): Promise<GetStreaksResponse> {
  return request<GetStreaksResponse>(ENDPOINTS.roomStreaks(code), { cookieHeader });
}

/** Create a challenge in a room. */
export async function createChallenge(
  code: RoomCode,
  body: CreateChallengeRequest,
  cookieHeader?: string,
): Promise<CreateChallengeResponse> {
  return request<CreateChallengeResponse>(ENDPOINTS.roomChallenges(code), {
    method: "POST",
    body: JSON.stringify(body),
    cookieHeader,
  });
}

/** Get active + past challenges for a room. */
export async function getRoomChallenges(
  code: RoomCode,
  cookieHeader?: string,
): Promise<GetChallengesResponse> {
  return request<GetChallengesResponse>(ENDPOINTS.roomChallenges(code), { cookieHeader });
}

// Track K (Phase 2): notification preferences + push subscriptions

/** Get the current user's notification preferences. */
export async function getNotificationPrefs(
  cookieHeader?: string,
): Promise<NotificationPrefsResponse> {
  return request<NotificationPrefsResponse>(ENDPOINTS.notificationPrefs, { cookieHeader });
}

/** Upsert the current user's notification preferences (partial update). */
export async function upsertNotificationPrefs(
  body: UpsertNotificationPrefsRequest,
  cookieHeader?: string,
): Promise<NotificationPrefsResponse> {
  return request<NotificationPrefsResponse>(ENDPOINTS.notificationPrefs, {
    method: "POST",
    body: JSON.stringify(body),
    cookieHeader,
  });
}

/** Delete all push subscriptions for the current user (logout / disable push). */
export async function deletePushSubscriptions(cookieHeader?: string): Promise<{ deleted: number }> {
  return request<{ deleted: number }>(ENDPOINTS.pushSubscriptions, {
    method: "DELETE",
    cookieHeader,
  });
}

/** Send a test push notification to the current user. */
export async function postPushTest(cookieHeader?: string): Promise<{ sent: boolean }> {
  return request<{ sent: boolean }>(ENDPOINTS.pushTest, {
    method: "POST",
    cookieHeader,
  });
}

// Phase 3 Track N: public profiles + global discovery

/** Update the signed-in user's public profile settings. */
export async function patchMe(
  body: PatchMeRequest,
  cookieHeader?: string,
): Promise<PatchMeResponse> {
  return request<PatchMeResponse>(ENDPOINTS.patchMe, {
    method: "PATCH",
    body: JSON.stringify(body),
    cookieHeader,
  });
}

/** Get the global trending leaderboard. */
export async function getTrending(
  range: LeaderboardRange = "today",
  cookieHeader?: string,
): Promise<GetTrendingResponse> {
  const url = `${ENDPOINTS.trending}?range=${range}`;
  return request<GetTrendingResponse>(url, { cookieHeader });
}

/** Submit an abuse report against a public handle. */
export async function reportAbuse(
  body: ReportAbuseRequest,
  cookieHeader?: string,
): Promise<ReportAbuseResponse> {
  return request<ReportAbuseResponse>(ENDPOINTS.reportAbuse, {
    method: "POST",
    body: JSON.stringify(body),
    cookieHeader,
  });
}

// Phase 3 Track O: org plan

/** Create a new org. */
export async function createOrg(
  body: CreateOrgRequest,
  cookieHeader?: string,
): Promise<CreateOrgResponse> {
  return request<CreateOrgResponse>(ENDPOINTS.orgs, {
    method: "POST",
    body: JSON.stringify(body),
    cookieHeader,
  });
}

/** Get org details + member list. */
export async function getOrg(slug: string, cookieHeader?: string): Promise<GetOrgResponse> {
  return request<GetOrgResponse>(ENDPOINTS.org(slug), { cookieHeader });
}

/** Create an org invite (admin/owner only). */
export async function createOrgInvite(
  slug: string,
  body: CreateOrgInviteRequest,
  cookieHeader?: string,
): Promise<CreateOrgInviteResponse> {
  return request<CreateOrgInviteResponse>(ENDPOINTS.orgInvites(slug), {
    method: "POST",
    body: JSON.stringify(body),
    cookieHeader,
  });
}

/** Accept a pending org invite (uses the signed-in user's GitHub login). */
export async function acceptOrgInvite(
  slug: string,
  cookieHeader?: string,
): Promise<AcceptOrgInviteResponse> {
  return request<AcceptOrgInviteResponse>(ENDPOINTS.orgAccept(slug), {
    method: "POST",
    cookieHeader,
  });
}

/** Get org spend dashboard (member-only). */
export async function getOrgDashboard(
  slug: string,
  cookieHeader?: string,
): Promise<GetOrgDashboardResponse> {
  return request<GetOrgDashboardResponse>(ENDPOINTS.orgDashboard(slug), { cookieHeader });
}

/**
 * Convenience object exported for import as `api.me()` etc.
 * Each method re-exports the standalone function above.
 */
export const api = {
  me: getMe,
  uploadSessions,
  createRoom,
  joinRoom,
  getRoom,
  getLeaderboard,
  getProfile,
  getAutobiography,
  getHeatmap,
  approveCli,
  getMyRooms,
  leaveRoom,
  renameRoom,
  getRoomActivity,
  getRoomStreaks,
  createChallenge,
  getRoomChallenges,
  getNotificationPrefs,
  upsertNotificationPrefs,
  deletePushSubscriptions,
  postPushTest,
  // Phase 3 Track N
  patchMe,
  getTrending,
  reportAbuse,
  // Phase 3 Track O
  createOrg,
  getOrg,
  createOrgInvite,
  acceptOrgInvite,
  getOrgDashboard,
  // Phase 3 Track M
  getProxyAnthropicKeyStatus,
  setProxyAnthropicKey,
  deleteProxyAnthropicKey,
};

// Phase 3 Track M: proxy key management

/** Check whether the current user has a stored Anthropic API key. */
export async function getProxyAnthropicKeyStatus(
  cookieHeader?: string,
): Promise<{ stored: boolean }> {
  return request<{ stored: boolean }>(ENDPOINTS.proxyAnthropicKey, { cookieHeader });
}

/** Store (or replace) the current user's Anthropic API key, encrypted server-side. */
export async function setProxyAnthropicKey(
  apiKey: string,
  cookieHeader?: string,
): Promise<{ stored: boolean }> {
  return request<{ stored: boolean }>(ENDPOINTS.proxyAnthropicKey, {
    method: "POST",
    body: JSON.stringify({ apiKey }),
    cookieHeader,
  });
}

/** Delete the current user's stored Anthropic API key. */
export async function deleteProxyAnthropicKey(
  cookieHeader?: string,
): Promise<{ stored: boolean }> {
  return request<{ stored: boolean }>(ENDPOINTS.proxyAnthropicKey, {
    method: "DELETE",
    cookieHeader,
  });
}
