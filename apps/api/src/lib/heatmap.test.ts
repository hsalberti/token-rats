/**
 * Unit tests for the quartile-binning helper (binCells) and the dense-day
 * filler. Pure functions, no Worker environment needed.
 */
import { describe, expect, it } from "vitest";
import { binCells, denseDays, offsetDay } from "./heatmap.js";

describe("offsetDay", () => {
  it("steps forward across month boundaries", () => {
    expect(offsetDay("2024-01-31", 1)).toBe("2024-02-01");
  });
  it("steps backward across month boundaries", () => {
    expect(offsetDay("2024-03-01", -1)).toBe("2024-02-29"); // leap year
  });
});

describe("denseDays", () => {
  it("fills zeros for missing days between from and to", () => {
    const dense = denseDays("2024-01-01", "2024-01-04", [
      { day: "2024-01-02", tokens: 100, costUsdCents: 5 },
    ]);
    expect(dense).toEqual([
      { date: "2024-01-01", tokens: 0, costUsdCents: 0 },
      { date: "2024-01-02", tokens: 100, costUsdCents: 5 },
      { date: "2024-01-03", tokens: 0, costUsdCents: 0 },
      { date: "2024-01-04", tokens: 0, costUsdCents: 0 },
    ]);
  });

  it("returns a single cell when from === to", () => {
    const dense = denseDays("2024-06-15", "2024-06-15", []);
    expect(dense).toEqual([{ date: "2024-06-15", tokens: 0, costUsdCents: 0 }]);
  });
});

describe("binCells — quartile binning", () => {
  it("returns all level-0 cells for an entirely-empty window", () => {
    const cells = binCells([
      { date: "2024-01-01", tokens: 0, costUsdCents: 0 },
      { date: "2024-01-02", tokens: 0, costUsdCents: 0 },
    ]);
    expect(cells.every((c) => c.level === 0)).toBe(true);
  });

  it("assigns level 0 to empty days even when other days are non-zero", () => {
    const cells = binCells([
      { date: "2024-01-01", tokens: 0, costUsdCents: 0 },
      { date: "2024-01-02", tokens: 100, costUsdCents: 10 },
      { date: "2024-01-03", tokens: 200, costUsdCents: 20 },
      { date: "2024-01-04", tokens: 0, costUsdCents: 0 },
    ]);
    expect(cells[0]?.level).toBe(0);
    expect(cells[3]?.level).toBe(0);
    expect(cells[1]?.level).toBeGreaterThanOrEqual(1);
    expect(cells[2]?.level).toBeGreaterThanOrEqual(1);
  });

  it("spreads a uniform non-zero distribution across non-zero levels", () => {
    // 8 non-zero days, tokens 100, 200, ..., 800
    const rows = Array.from({ length: 8 }, (_, i) => ({
      date: `2024-01-${String(i + 1).padStart(2, "0")}`,
      tokens: (i + 1) * 100,
      costUsdCents: (i + 1) * 10,
    }));
    const cells = binCells(rows);
    const levels = cells.map((c) => c.level);
    // Smallest should be level 1, largest should be level 4.
    expect(levels[0]).toBe(1);
    expect(levels[7]).toBe(4);
    // Every level >= 1 should appear at least once.
    expect(new Set(levels)).toEqual(new Set([1, 2, 3, 4]));
  });

  it("places a tiny user (1 active day) on a meaningful level", () => {
    const cells = binCells([
      { date: "2024-01-01", tokens: 0, costUsdCents: 0 },
      { date: "2024-01-02", tokens: 50, costUsdCents: 1 },
      { date: "2024-01-03", tokens: 0, costUsdCents: 0 },
    ]);
    expect(cells[1]?.level).toBeGreaterThanOrEqual(1);
  });

  it("preserves date order in the output", () => {
    const cells = binCells([
      { date: "2024-01-01", tokens: 10, costUsdCents: 1 },
      { date: "2024-01-02", tokens: 20, costUsdCents: 2 },
    ]);
    expect(cells.map((c) => c.date)).toEqual(["2024-01-01", "2024-01-02"]);
  });
});
