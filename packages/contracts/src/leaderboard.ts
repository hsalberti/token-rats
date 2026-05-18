import { z } from "zod";

export const LeaderboardRange = z.enum(["today", "7d", "30d", "all"]);
export type LeaderboardRange = z.infer<typeof LeaderboardRange>;

/** Per-source breakdown used for the "top 2" badges next to a handle. */
export const SourceBreakdownEntry = z.object({
  source: z.string(),
  tokens: z.number().int().nonnegative(),
});
export type SourceBreakdownEntry = z.infer<typeof SourceBreakdownEntry>;

export const LeaderboardRow = z.object({
  rank: z.number().int().positive(),
  userId: z.string(),
  handle: z.string(),
  avatarUrl: z.string().url().nullable(),
  tokens: z.number().int().nonnegative(),
  costUsdCents: z.number().int().nonnegative(),
  sessions: z.number().int().nonnegative(),
  /** Up to 2 dominant sources by token volume, descending. May be empty. */
  topSources: z.array(SourceBreakdownEntry).max(2).default([]),
});
export type LeaderboardRow = z.infer<typeof LeaderboardRow>;

export const Leaderboard = z.object({
  range: LeaderboardRange,
  generatedAt: z.number().int().positive(),
  rows: z.array(LeaderboardRow),
});
export type Leaderboard = z.infer<typeof Leaderboard>;
