/**
 * v1.2 Track Y — shared heatmap helpers.
 *
 * `binCells` takes a list of (date, tokens, costUsdCents) rows for the heatmap
 * window and assigns each day a quartile-based intensity level over the
 * scope's *non-zero* days, so a quiet user and a heavy room each render with
 * a meaningful distribution. Empty days always get level 0.
 *
 * Pure function so it's trivial to unit-test from a vitest suite without a
 * Worker environment.
 */

import type { HeatmapCell, HeatmapLevel } from "@token-rats/contracts";

export interface RawDay {
  /** UTC day, YYYY-MM-DD. */
  date: string;
  tokens: number;
  costUsdCents: number;
}

/**
 * Compute the [q1, q2, q3] cut-points for the *non-zero* values in `values`.
 *
 * Strategy: sort ascending, then pick the 25%/50%/75% indices. Returns the
 * three cut-points used to split the non-zero distribution into 4 quartiles.
 * If `values` is empty or has too few entries, every cut-point falls back to
 * 0 (so every non-zero day lands in level 1 — better than nothing).
 */
function quartileCuts(values: number[]): [number, number, number] {
  if (values.length === 0) return [0, 0, 0];
  const sorted = [...values].sort((a, b) => a - b);
  const q = (p: number): number => {
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * p)));
    return sorted[idx] ?? 0;
  };
  return [q(0.25), q(0.5), q(0.75)];
}

/** Quartile-bin a single non-zero value against [q1, q2, q3] cuts. */
function bucketize(v: number, cuts: [number, number, number]): HeatmapLevel {
  if (v === 0) return 0;
  const [q1, q2, q3] = cuts;
  if (v >= q3) return 4;
  if (v >= q2) return 3;
  if (v >= q1) return 2;
  return 1;
}

/**
 * Assign a `level` to each cell using quartiles of the non-zero tokens
 * distribution. Empty days get level 0 unchanged.
 */
export function binCells(rows: RawDay[]): HeatmapCell[] {
  const nonZero = rows.filter((r) => r.tokens > 0).map((r) => r.tokens);
  const cuts = quartileCuts(nonZero);
  return rows.map((r) => ({
    date: r.date,
    tokens: r.tokens,
    costUsdCents: r.costUsdCents,
    level: bucketize(r.tokens, cuts),
  }));
}

/**
 * Offset a YYYY-MM-DD string by `days` (negative or positive) and return the
 * resulting YYYY-MM-DD UTC string.
 */
export function offsetDay(yyyy_mm_dd: string, days: number): string {
  const d = new Date(`${yyyy_mm_dd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Build a contiguous, zero-filled list of dates from `from` to `to` (inclusive)
 * with the totals from `dayRows` merged in. The output is sorted ascending.
 */
export function denseDays(
  from: string,
  to: string,
  dayRows: { day: string; tokens: number; costUsdCents: number }[],
): RawDay[] {
  const byDay = new Map(
    dayRows.map((d) => [d.day, { tokens: d.tokens, costUsdCents: d.costUsdCents }]),
  );

  const result: RawDay[] = [];
  let cursor = from;
  while (cursor <= to) {
    const hit = byDay.get(cursor);
    result.push({
      date: cursor,
      tokens: hit?.tokens ?? 0,
      costUsdCents: hit?.costUsdCents ?? 0,
    });
    cursor = offsetDay(cursor, 1);
  }
  return result;
}
