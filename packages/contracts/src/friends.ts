import { z } from "zod";
import { LeaderboardRange } from "./leaderboard.js";

/**
 * v1.2 Track AD — friends are derived, not requested.
 * A friend is any user the caller shares at least one private (non-public) room with.
 */
export const FriendSharedRoom = z.object({
  code: z.string(),
  name: z.string(),
});
export type FriendSharedRoom = z.infer<typeof FriendSharedRoom>;

export const FriendRow = z.object({
  userId: z.string(),
  handle: z.string(),
  avatarUrl: z.string().url().nullable(),
  twitterHandle: z.string().nullable().optional(),
  publicProfile: z.boolean(),
  sharedRooms: z.array(FriendSharedRoom),
  tokens: z.number().int().nonnegative(),
  costUsdCents: z.number().int().nonnegative(),
  sessions: z.number().int().nonnegative(),
});
export type FriendRow = z.infer<typeof FriendRow>;

export const FriendsResponse = z.object({
  range: LeaderboardRange,
  friends: z.array(FriendRow),
});
export type FriendsResponse = z.infer<typeof FriendsResponse>;
