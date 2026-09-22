import { z } from "zod";

export const UsageMonth = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/);
export const SubscriptionSpendRequest = z.object({
  month: UsageMonth,
  source: z.enum(["claude-code", "codex", "cursor"]),
  label: z.string().trim().min(1).max(80),
  paidUsdCents: z.number().int().min(0).max(100_000_000),
});
export type SubscriptionSpendRequest = z.infer<typeof SubscriptionSpendRequest>;
export interface SourceComparison {
  source: SubscriptionSpendRequest["source"];
  sessions: number;
  activeDays: number;
  inTokens: number;
  outTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  estimatedApiUsd: number;
  unpricedSessions: number;
  tokensEstimated: boolean;
  subscription: { label: string; paidUsdCents: number } | null;
}
export interface ComparisonResponse {
  month: string;
  sources: SourceComparison[];
}
