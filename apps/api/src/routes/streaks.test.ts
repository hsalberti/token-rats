/**
 * Unit tests for the streak computation helper.
 *
 * computeStreaks() is a pure function exported from streaks.ts, so we can
 * test it with in-memory fixtures — no D1 / Worker environment needed.
 */
import { describe, expect, it } from "vitest";
import { computeStreaks } from "./streaks.js";

describe("computeStreaks", () => {
  it("returns zeros for an empty day list", () => {
    expect(computeStreaks([], "2024-01-10")).toEqual({
      currentStreak: 0,
      longestStreak: 0,
    });
  });

  it("returns 1/1 for a single day equal to today", () => {
    expect(computeStreaks(["2024-01-10"], "2024-01-10")).toEqual({
      currentStreak: 1,
      longestStreak: 1,
    });
  });

  it("returns 1/1 for a single day equal to yesterday", () => {
    expect(computeStreaks(["2024-01-09"], "2024-01-10")).toEqual({
      currentStreak: 1,
      longestStreak: 1,
    });
  });

  it("returns 0 currentStreak for a single day that is neither today nor yesterday", () => {
    const result = computeStreaks(["2024-01-07"], "2024-01-10");
    expect(result.currentStreak).toBe(0);
    expect(result.longestStreak).toBe(1);
  });

  it("counts a consecutive run ending today as current streak", () => {
    const days = ["2024-01-08", "2024-01-09", "2024-01-10"];
    expect(computeStreaks(days, "2024-01-10")).toEqual({
      currentStreak: 3,
      longestStreak: 3,
    });
  });

  it("counts a consecutive run ending yesterday as still active", () => {
    const days = ["2024-01-08", "2024-01-09"];
    expect(computeStreaks(days, "2024-01-10")).toEqual({
      currentStreak: 2,
      longestStreak: 2,
    });
  });

  it("breaks streak when there is a gap before the most recent days", () => {
    // Longest is days 1-5, but there's a gap before the final run of 2
    const days = [
      "2024-01-01",
      "2024-01-02",
      "2024-01-03",
      "2024-01-04",
      "2024-01-05",
      // gap: 6th missing
      "2024-01-07",
      "2024-01-08",
      "2024-01-09", // yesterday relative to today=10
    ];
    const result = computeStreaks(days, "2024-01-10");
    expect(result.currentStreak).toBe(3); // 7,8,9
    expect(result.longestStreak).toBe(5); // 1-5
  });

  it("detects broken current streak (last activity was 2+ days ago)", () => {
    const days = ["2024-01-01", "2024-01-02", "2024-01-03"];
    const result = computeStreaks(days, "2024-01-10");
    expect(result.currentStreak).toBe(0);
    expect(result.longestStreak).toBe(3);
  });

  it("handles a single-element list that is yesterday", () => {
    expect(computeStreaks(["2024-03-14"], "2024-03-15")).toEqual({
      currentStreak: 1,
      longestStreak: 1,
    });
  });

  it("handles non-consecutive days and picks the longest run", () => {
    const days = [
      "2024-01-01",
      // gap
      "2024-01-03",
      "2024-01-04",
      "2024-01-05",
      "2024-01-06",
      // gap
      "2024-01-08",
      "2024-01-09",
      "2024-01-10", // today
    ];
    const result = computeStreaks(days, "2024-01-10");
    expect(result.currentStreak).toBe(3); // 8,9,10
    expect(result.longestStreak).toBe(4); // 3,4,5,6
  });
});
