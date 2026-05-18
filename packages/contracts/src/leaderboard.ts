import { z } from "zod";

export const LeaderboardRange = z.enum(["today", "7d", "30d", "all"]);
export type LeaderboardRange = z.infer<typeof LeaderboardRange>;

export const LeaderboardRow = z.object({
  rank: z.number().int().positive(),
  userId: z.string(),
  handle: z.string(),
  avatarUrl: z.string().url().nullable(),
  tokens: z.number().int().nonnegative(),
  costUsdCents: z.number().int().nonnegative(),
  sessions: z.number().int().nonnegative(),
});
export type LeaderboardRow = z.infer<typeof LeaderboardRow>;

export const Leaderboard = z.object({
  range: LeaderboardRange,
  generatedAt: z.number().int().positive(),
  rows: z.array(LeaderboardRow),
});
export type Leaderboard = z.infer<typeof Leaderboard>;
