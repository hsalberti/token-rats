/**
 * Unit tests for sessions-ingest helpers.
 *
 * These test the pure helper logic (day computation, rollup grouping) without
 * a real D1/KV environment.
 */
import { describe, it, expect } from "vitest";

/* ---- inline the helpers we want to test (they're not exported from the route,
        so we duplicate the tiny functions here) ----------------------------- */

function toUtcDay(tsMs: number): string {
  return new Date(tsMs).toISOString().slice(0, 10);
}

/** Group an array of {startedAt, tokens, costUsdCents} records by UTC day. */
function groupByDay(
  records: Array<{
    startedAt: number;
    inTokens: number;
    outTokens: number;
    costUsdCents: number;
  }>,
): Map<string, { tokens: number; costUsdCents: number; sessions: number }> {
  const grouped = new Map<string, { tokens: number; costUsdCents: number; sessions: number }>();
  for (const r of records) {
    const day = toUtcDay(r.startedAt);
    const existing = grouped.get(day);
    if (existing) {
      existing.tokens += r.inTokens + r.outTokens;
      existing.costUsdCents += r.costUsdCents;
      existing.sessions += 1;
    } else {
      grouped.set(day, {
        tokens: r.inTokens + r.outTokens,
        costUsdCents: r.costUsdCents,
        sessions: 1,
      });
    }
  }
  return grouped;
}

/* -------------------------------------------------------------------------- */

describe("toUtcDay", () => {
  it("formats a timestamp as YYYY-MM-DD in UTC", () => {
    // 2024-03-15T00:00:00Z
    expect(toUtcDay(1710460800000)).toBe("2024-03-15");
  });

  it("uses UTC, not local time", () => {
    // 2024-01-01T23:59:59Z — should remain 2024-01-01
    expect(toUtcDay(1704153599000)).toBe("2024-01-01");
  });
});

describe("groupByDay", () => {
  it("merges records on the same day", () => {
    const base = new Date("2024-06-01T10:00:00Z").getTime();
    const records = [
      { startedAt: base, inTokens: 100, outTokens: 50, costUsdCents: 10 },
      { startedAt: base + 3_600_000, inTokens: 200, outTokens: 80, costUsdCents: 20 },
    ];
    const grouped = groupByDay(records);
    expect(grouped.size).toBe(1);
    const day = grouped.get("2024-06-01");
    expect(day).toBeDefined();
    expect(day?.tokens).toBe(430); // (100+50) + (200+80)
    expect(day?.costUsdCents).toBe(30);
    expect(day?.sessions).toBe(2);
  });

  it("splits records across different days", () => {
    const day1 = new Date("2024-06-01T12:00:00Z").getTime();
    const day2 = new Date("2024-06-02T12:00:00Z").getTime();
    const records = [
      { startedAt: day1, inTokens: 100, outTokens: 50, costUsdCents: 5 },
      { startedAt: day2, inTokens: 200, outTokens: 100, costUsdCents: 15 },
    ];
    const grouped = groupByDay(records);
    expect(grouped.size).toBe(2);
    expect(grouped.get("2024-06-01")?.tokens).toBe(150);
    expect(grouped.get("2024-06-02")?.tokens).toBe(300);
  });

  it("handles an empty array", () => {
    expect(groupByDay([])).toEqual(new Map());
  });
});
