/**
 * Unit tests for the pure leaderboard helpers extracted from leaderboard.ts.
 *
 * Two things are load-bearing and easy to break silently:
 *   1. The date-window math (`offsetDay` / `dateFilter`), which must roll
 *      correctly across month and year boundaries — a leap into the wrong
 *      month shifts the whole "7d"/"30d" window.
 *   2. The aggregation/ranking shape, including the zero-rollup member case:
 *      a room member with no daily_rollup rows in the window still arrives
 *      (LEFT JOIN + COALESCE) with zeroed counts and must rank. That invariant
 *      is exactly what the Brazil ⊂ Global divergence broke.
 */

import { describe, expect, it } from "vitest";
import {
  type LeaderboardAggregateRow,
  type SourceTokensRow,
  buildLeaderboardRows,
  dateFilter,
  offsetDay,
  top2ByUser,
} from "./leaderboard.js";

describe("offsetDay", () => {
  it("subtracts days within a month", () => {
    expect(offsetDay("2026-06-15", -6)).toBe("2026-06-09");
  });

  it("adds days within a month", () => {
    expect(offsetDay("2026-06-15", 3)).toBe("2026-06-18");
  });

  it("rolls back across a month boundary", () => {
    // 2026-03-03 - 6 days lands in February.
    expect(offsetDay("2026-03-03", -6)).toBe("2026-02-25");
  });

  it("handles the leap-year February boundary", () => {
    // 2028 is a leap year — Feb has 29 days.
    expect(offsetDay("2028-03-01", -1)).toBe("2028-02-29");
  });

  it("handles the non-leap February boundary", () => {
    // 2026 is not a leap year — Feb has 28 days.
    expect(offsetDay("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("rolls back across a year boundary", () => {
    expect(offsetDay("2026-01-03", -6)).toBe("2025-12-28");
  });

  it("rolls forward across a year boundary", () => {
    expect(offsetDay("2026-12-30", 3)).toBe("2027-01-02");
  });

  it("is identity for a zero offset", () => {
    expect(offsetDay("2026-06-15", 0)).toBe("2026-06-15");
  });
});

describe("dateFilter", () => {
  it("'today' pins to the exact day with an equality clause", () => {
    const { clause, params } = dateFilter("today", "2026-06-15");
    expect(clause).toBe("AND dr.day = ?");
    expect(params).toEqual(["2026-06-15"]);
  });

  it("'7d' covers today minus six days (7 days inclusive)", () => {
    const { clause, params } = dateFilter("7d", "2026-06-15");
    expect(clause).toBe("AND dr.day >= ?");
    expect(params).toEqual(["2026-06-09"]);
  });

  it("'30d' covers today minus 29 days (30 days inclusive)", () => {
    const { clause, params } = dateFilter("30d", "2026-06-15");
    expect(clause).toBe("AND dr.day >= ?");
    expect(params).toEqual(["2026-05-17"]);
  });

  it("'7d' window crosses a year boundary correctly", () => {
    const { params } = dateFilter("7d", "2026-01-03");
    expect(params).toEqual(["2025-12-28"]);
  });

  it("'30d' window crosses a year boundary correctly", () => {
    const { params } = dateFilter("30d", "2026-01-15");
    // 2026-01-15 - 29 days = 2025-12-17
    expect(params).toEqual(["2025-12-17"]);
  });

  it("'all' applies no date filter and binds nothing", () => {
    const { clause, params } = dateFilter("all", "2026-06-15");
    expect(clause).toBe("");
    expect(params).toEqual([]);
  });
});

describe("top2ByUser", () => {
  it("keeps at most the first two rows per user", () => {
    const rows: SourceTokensRow[] = [
      { user_id: "u1", source: "claude-code", tokens: 300 },
      { user_id: "u1", source: "codex", tokens: 200 },
      { user_id: "u1", source: "cursor", tokens: 100 },
      { user_id: "u2", source: "cursor", tokens: 50 },
    ];
    const map = top2ByUser(rows);
    expect(map.get("u1")).toEqual([
      { source: "claude-code", tokens: 300 },
      { source: "codex", tokens: 200 },
    ]);
    expect(map.get("u2")).toEqual([{ source: "cursor", tokens: 50 }]);
  });

  it("returns an empty map for no rows", () => {
    expect(top2ByUser([]).size).toBe(0);
  });
});

describe("buildLeaderboardRows", () => {
  const empty = new Map<string, { source: string; tokens: number }[]>();

  it("ranks rows 1..N in the order received", () => {
    const rows: LeaderboardAggregateRow[] = [
      {
        user_id: "u1",
        handle: "alice",
        avatar_url: "https://x/a.png",
        country: "BR",
        tokens: 500,
        cost_usd_cents: 25,
        sessions: 3,
      },
      {
        user_id: "u2",
        handle: "bob",
        avatar_url: null,
        country: "US",
        tokens: 200,
        cost_usd_cents: 10,
        sessions: 1,
      },
    ];
    const out = buildLeaderboardRows(rows, empty, empty, empty);
    expect(out.map((r) => r.rank)).toEqual([1, 2]);
    expect(out[0]?.handle).toBe("alice");
    expect(out[0]?.tokens).toBe(500);
    expect(out[1]?.handle).toBe("bob");
  });

  it("keeps a zero-rollup member in the leaderboard (Brazil ⊂ Global invariant)", () => {
    // A member with no daily_rollup rows in the window arrives via the route's
    // LEFT JOIN + COALESCE with zeroed counts. They must still appear and rank,
    // otherwise a country board ends up missing members the global board shows.
    const rows: LeaderboardAggregateRow[] = [
      {
        user_id: "u1",
        handle: "active",
        avatar_url: null,
        country: "BR",
        tokens: 1000,
        cost_usd_cents: 50,
        sessions: 4,
      },
      {
        user_id: "u2",
        handle: "idle",
        avatar_url: null,
        country: "BR",
        tokens: 0,
        cost_usd_cents: 0,
        sessions: 0,
      },
    ];
    const out = buildLeaderboardRows(rows, empty, empty, empty);
    expect(out).toHaveLength(2);
    const idle = out.find((r) => r.handle === "idle");
    expect(idle).toBeDefined();
    expect(idle?.tokens).toBe(0);
    expect(idle?.sessions).toBe(0);
    expect(idle?.rank).toBe(2);
  });

  it("defaults the breakdown arrays to empty when a user has none", () => {
    const rows: LeaderboardAggregateRow[] = [
      {
        user_id: "u1",
        handle: "alice",
        avatar_url: null,
        country: null,
        tokens: 10,
        cost_usd_cents: 1,
        sessions: 1,
      },
    ];
    const out = buildLeaderboardRows(rows, empty, empty, empty);
    expect(out[0]?.topSources).toEqual([]);
    expect(out[0]?.topClients).toEqual([]);
    expect(out[0]?.topChannels).toEqual([]);
  });

  it("attaches per-user top-2 breakdowns", () => {
    const rows: LeaderboardAggregateRow[] = [
      {
        user_id: "u1",
        handle: "alice",
        avatar_url: null,
        country: null,
        tokens: 10,
        cost_usd_cents: 1,
        sessions: 1,
      },
    ];
    const sources = top2ByUser([
      { user_id: "u1", source: "claude-code", tokens: 8 },
      { user_id: "u1", source: "codex", tokens: 2 },
    ]);
    const out = buildLeaderboardRows(rows, sources, empty, empty);
    expect(out[0]?.topSources).toEqual([
      { source: "claude-code", tokens: 8 },
      { source: "codex", tokens: 2 },
    ]);
  });

  it("returns an empty array for an empty room", () => {
    expect(buildLeaderboardRows([], empty, empty, empty)).toEqual([]);
  });
});
