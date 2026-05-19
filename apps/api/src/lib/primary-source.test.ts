/**
 * Unit tests for the primary-source helper (apps/api/src/lib/primary-source.ts).
 *
 * v1.2 Track AF — covers ≥50% threshold, tie-at-50% resolution, below-threshold
 * returning null, single-source users, and the `unknown` plan fallback.
 */

import { describe, expect, it } from "vitest";
import { computePrimarySource, formatPrimarySourceLabel } from "./primary-source.js";

describe("formatPrimarySourceLabel", () => {
  it("collapses claude-code + max → claude-max", () => {
    expect(formatPrimarySourceLabel("claude-code", "max")).toBe("claude-max");
  });

  it("collapses claude-code + pro → claude-pro", () => {
    expect(formatPrimarySourceLabel("claude-code", "pro")).toBe("claude-pro");
  });

  it("collapses claude-code + api → claude-api", () => {
    expect(formatPrimarySourceLabel("claude-code", "api")).toBe("claude-api");
  });

  it("falls back to bare claude-code when plan is unknown", () => {
    expect(formatPrimarySourceLabel("claude-code", "unknown")).toBe("claude-code");
  });

  it("falls back to bare claude-code when plan is null", () => {
    expect(formatPrimarySourceLabel("claude-code", null)).toBe("claude-code");
  });

  it("renders cursor + ide → cursor-ide", () => {
    expect(formatPrimarySourceLabel("cursor", "ide")).toBe("cursor-ide");
  });

  it("renders codex + api → codex-api", () => {
    expect(formatPrimarySourceLabel("codex", "api")).toBe("codex-api");
  });

  it("renders codex + pro → codex-pro", () => {
    expect(formatPrimarySourceLabel("codex", "pro")).toBe("codex-pro");
  });

  it("falls back to bare codex when plan is unknown", () => {
    expect(formatPrimarySourceLabel("codex", "unknown")).toBe("codex");
  });
});

describe("computePrimarySource", () => {
  it("returns null for an empty input", () => {
    expect(computePrimarySource([])).toBeNull();
  });

  it("returns null when total cost is zero", () => {
    expect(
      computePrimarySource([
        { source: "claude-code", sourcePlan: "max", cost: 0 },
        { source: "cursor", sourcePlan: "ide", cost: 0 },
      ]),
    ).toBeNull();
  });

  it("returns the matching label when one row has 60% share (≥50%)", () => {
    expect(
      computePrimarySource([
        { source: "claude-code", sourcePlan: "max", cost: 600 },
        { source: "cursor", sourcePlan: "ide", cost: 400 },
      ]),
    ).toBe("claude-max");
  });

  it("returns null when the top row has 40% share (<50%)", () => {
    expect(
      computePrimarySource([
        { source: "claude-code", sourcePlan: "max", cost: 400 },
        { source: "cursor", sourcePlan: "ide", cost: 300 },
        { source: "codex", sourcePlan: "api", cost: 300 },
      ]),
    ).toBeNull();
  });

  it("resolves an exact 50/50 tie by picking the first-listed row (sort-stable)", () => {
    // Caller is expected to pre-sort by cost desc. With two rows tied at
    // cost=500 each (50% share each), the first wins.
    expect(
      computePrimarySource([
        { source: "claude-code", sourcePlan: "max", cost: 500 },
        { source: "cursor", sourcePlan: "ide", cost: 500 },
      ]),
    ).toBe("claude-max");
  });

  it("returns the only source's label for a single-source user", () => {
    expect(computePrimarySource([{ source: "claude-code", sourcePlan: "max", cost: 1234 }])).toBe(
      "claude-max",
    );
  });

  it("falls back to bare source label when the dominant plan is unknown", () => {
    expect(
      computePrimarySource([
        { source: "claude-code", sourcePlan: "unknown", cost: 700 },
        { source: "cursor", sourcePlan: "ide", cost: 300 },
      ]),
    ).toBe("claude-code");
  });

  it("falls back to bare source label when the dominant plan is null", () => {
    expect(
      computePrimarySource([
        { source: "claude-code", sourcePlan: null, cost: 700 },
        { source: "cursor", sourcePlan: "ide", cost: 300 },
      ]),
    ).toBe("claude-code");
  });

  it("emits cursor-ide for an IDE-dominant user", () => {
    expect(
      computePrimarySource([
        { source: "cursor", sourcePlan: "ide", cost: 800 },
        { source: "claude-code", sourcePlan: "max", cost: 200 },
      ]),
    ).toBe("cursor-ide");
  });

  it("emits codex-api for an API-dominant Codex user", () => {
    expect(
      computePrimarySource([
        { source: "codex", sourcePlan: "api", cost: 999 },
        { source: "claude-code", sourcePlan: "max", cost: 1 },
      ]),
    ).toBe("codex-api");
  });

  it("ignores negative costs (treats them as 0)", () => {
    // Defensive: shouldn't happen in practice but the helper must not crash
    // or produce a NaN share when D1 returns weird values.
    const result = computePrimarySource([
      { source: "claude-code", sourcePlan: "max", cost: 600 },
      { source: "cursor", sourcePlan: "ide", cost: -100 },
    ]);
    expect(result).toBe("claude-max");
  });
});
