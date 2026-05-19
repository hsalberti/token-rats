import { z } from "zod";
import { LeaderboardRange } from "./leaderboard.js";

/** v1.2 Track Y — model spend breakdown for the room stat strip. */
export const RoomModelMix = z.object({
  model: z.string(),
  costUsdCents: z.number().int().nonnegative(),
  sharePct: z.number().min(0).max(100),
});
export type RoomModelMix = z.infer<typeof RoomModelMix>;

export const RoomSourceMix = z.object({
  source: z.string(),
  costUsdCents: z.number().int().nonnegative(),
  sharePct: z.number().min(0).max(100),
});
export type RoomSourceMix = z.infer<typeof RoomSourceMix>;

export const RoomSummary = z.object({
  range: LeaderboardRange,
  totalCostUsdCents: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  /** Members who had ≥1 session in the range. */
  activeMembers: z.number().int().nonnegative(),
  /** Distinct UTC days with ≥1 session across the room. */
  dayCount: z.number().int().nonnegative(),
  /** 0–100; share of total cost contributed by the top member in the range. */
  topContributorSharePct: z.number().min(0).max(100),
  modelMix: z.array(RoomModelMix),
  sourceMix: z.array(RoomSourceMix),
  generatedAt: z.number().int().positive(),
});
export type RoomSummary = z.infer<typeof RoomSummary>;

export const RoomSummaryResponse = z.object({ summary: RoomSummary });
export type RoomSummaryResponse = z.infer<typeof RoomSummaryResponse>;
