import { z } from "zod";

/* -------------------------------------------------------------------------- */
/* Streaks                                                                     */
/* -------------------------------------------------------------------------- */

/** Per-user-per-room streak row returned by GET /v1/rooms/:code/streaks. */
export const StreakRow = z.object({
  userId: z.string(),
  handle: z.string(),
  avatarUrl: z.string().url().nullable(),
  currentStreak: z.number().int().nonnegative(),
  longestStreak: z.number().int().nonnegative(),
});
export type StreakRow = z.infer<typeof StreakRow>;

/* -------------------------------------------------------------------------- */
/* Activity feed                                                               */
/* -------------------------------------------------------------------------- */

/** A single activity event for GET /v1/rooms/:code/activity. */
export const ActivityRow = z.object({
  sessionId: z.string(),
  at: z.number().int().positive(),
  userId: z.string(),
  handle: z.string(),
  avatarUrl: z.string().url().nullable(),
  tokens: z.number().int().nonnegative(),
  costUsdCents: z.number().int().nonnegative(),
  model: z.string(),
});
export type ActivityRow = z.infer<typeof ActivityRow>;

/* -------------------------------------------------------------------------- */
/* Challenges                                                                  */
/* -------------------------------------------------------------------------- */

export const ChallengeKind = z.enum(["most-tokens", "longest-streak", "most-sessions"]);
export type ChallengeKind = z.infer<typeof ChallengeKind>;

export const Challenge = z.object({
  id: z.string(),
  roomId: z.string(),
  kind: ChallengeKind,
  startsAt: z.number().int().positive(),
  endsAt: z.number().int().positive(),
  createdAt: z.number().int().positive(),
});
export type Challenge = z.infer<typeof Challenge>;

/** A challenge entry row inside the challenge leaderboard. */
export const ChallengeLeaderboardRow = z.object({
  rank: z.number().int().positive(),
  userId: z.string(),
  handle: z.string(),
  avatarUrl: z.string().url().nullable(),
  score: z.number().int().nonnegative(),
});
export type ChallengeLeaderboardRow = z.infer<typeof ChallengeLeaderboardRow>;

/** Challenge + computed leaderboard, returned in GET /v1/rooms/:code/challenges. */
export const ChallengeWithLeaderboard = Challenge.extend({
  rows: z.array(ChallengeLeaderboardRow),
  /** Set only for past challenges — handle of the winner (top row). */
  winnerHandle: z.string().nullable(),
});
export type ChallengeWithLeaderboard = z.infer<typeof ChallengeWithLeaderboard>;
