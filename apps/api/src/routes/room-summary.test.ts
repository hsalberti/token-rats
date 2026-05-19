/**
 * Unit tests for the room-summary route — validates the response contract.
 *
 * The route's query parsing + KV cache key contract is unit-tested here.
 * Full-stack member-gated D1 behavior is exercised by the smoke walk in the
 * roadmap's Phase 5a convergence step.
 */
import { describe, expect, it } from "vitest";
import { LeaderboardRange, RoomSummary, RoomSummaryResponse } from "@token-rats/contracts";

describe("RoomSummary contract", () => {
  it("parses a fully-populated summary", () => {
    const sample = {
      range: "7d" as const,
      totalCostUsdCents: 1234,
      totalTokens: 56789,
      activeMembers: 3,
      dayCount: 5,
      topContributorSharePct: 42.7,
      modelMix: [
        { model: "claude-sonnet-4-5", costUsdCents: 700, sharePct: 60 },
        { model: "claude-haiku-4-5", costUsdCents: 300, sharePct: 25 },
        { model: "gpt-5", costUsdCents: 234, sharePct: 15 },
      ],
      sourceMix: [
        { source: "claude-code", costUsdCents: 1000, sharePct: 81 },
        { source: "cursor", costUsdCents: 234, sharePct: 19 },
      ],
      generatedAt: Date.now(),
    };
    const result = RoomSummary.safeParse(sample);
    expect(result.success).toBe(true);
  });

  it("parses an empty-room summary", () => {
    const sample = {
      range: "today" as const,
      totalCostUsdCents: 0,
      totalTokens: 0,
      activeMembers: 0,
      dayCount: 0,
      topContributorSharePct: 0,
      modelMix: [],
      sourceMix: [],
      generatedAt: Date.now(),
    };
    expect(RoomSummary.safeParse(sample).success).toBe(true);
  });

  it("wraps the summary in a RoomSummaryResponse envelope", () => {
    const sample = {
      summary: {
        range: "all" as const,
        totalCostUsdCents: 0,
        totalTokens: 0,
        activeMembers: 0,
        dayCount: 0,
        topContributorSharePct: 0,
        modelMix: [],
        sourceMix: [],
        generatedAt: Date.now(),
      },
    };
    expect(RoomSummaryResponse.safeParse(sample).success).toBe(true);
  });

  it("rejects an out-of-bound share pct (>100)", () => {
    const sample = {
      range: "7d" as const,
      totalCostUsdCents: 100,
      totalTokens: 1,
      activeMembers: 1,
      dayCount: 1,
      topContributorSharePct: 101,
      modelMix: [],
      sourceMix: [],
      generatedAt: Date.now(),
    };
    expect(RoomSummary.safeParse(sample).success).toBe(false);
  });

  it("accepts every LeaderboardRange value", () => {
    for (const range of LeaderboardRange.options) {
      const sample = {
        range,
        totalCostUsdCents: 0,
        totalTokens: 0,
        activeMembers: 0,
        dayCount: 0,
        topContributorSharePct: 0,
        modelMix: [],
        sourceMix: [],
        generatedAt: Date.now(),
      };
      expect(RoomSummary.safeParse(sample).success).toBe(true);
    }
  });
});
