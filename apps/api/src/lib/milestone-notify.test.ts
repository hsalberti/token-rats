import { describe, expect, it } from "vitest";
import { crossedMilestone } from "./milestone-notify.js";

describe("crossedMilestone", () => {
  it("returns null when no threshold is crossed", () => {
    expect(crossedMilestone(0, 500_000)).toBeNull();
    expect(crossedMilestone(1_000_000, 1_500_000)).toBeNull();
    expect(crossedMilestone(2_000_000, 9_999_999)).toBeNull();
  });

  it("returns the threshold when crossed exactly", () => {
    expect(crossedMilestone(999_999, 1_000_000)).toBe(1_000_000);
    expect(crossedMilestone(9_500_000, 10_000_000)).toBe(10_000_000);
  });

  it("returns the highest threshold when several are crossed in one ingest", () => {
    expect(crossedMilestone(0, 12_000_000)).toBe(10_000_000);
    expect(crossedMilestone(900_000, 60_000_000)).toBe(50_000_000);
  });

  it("never re-fires for totals already past the top threshold", () => {
    expect(crossedMilestone(1_000_000_000, 1_200_000_000)).toBeNull();
  });
});
