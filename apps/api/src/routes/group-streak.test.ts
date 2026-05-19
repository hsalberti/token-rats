/**
 * Unit tests for the group-streak helpers. Exercises the active-union /
 * unanimous-intersection semantics with member-joined-mid-streak coverage.
 */
import { describe, expect, it } from "vitest";
import { buildGroupDaySets, type GroupMember, type MemberDay } from "./group-streak.js";
import { computeStreaks } from "./streaks.js";

const yesterday = "2024-01-09";
const today = "2024-01-10";

describe("buildGroupDaySets — empty / single-member rooms", () => {
  it("returns empty sets for an empty room", () => {
    const out = buildGroupDaySets([], []);
    expect(out.activeDays).toEqual([]);
    expect(out.unanimousDays).toEqual([]);
  });

  it("returns the single member's days for both sets in a single-member room", () => {
    const members: GroupMember[] = [{ userId: "u1", joinedDay: "2024-01-01" }];
    const dayRows: MemberDay[] = [
      { userId: "u1", day: "2024-01-08" },
      { userId: "u1", day: "2024-01-09" },
      { userId: "u1", day: "2024-01-10" },
    ];
    const out = buildGroupDaySets(members, dayRows);
    expect(out.activeDays).toEqual(["2024-01-08", "2024-01-09", "2024-01-10"]);
    expect(out.unanimousDays).toEqual(["2024-01-08", "2024-01-09", "2024-01-10"]);
  });
});

describe("buildGroupDaySets — multi-member room with mixed days", () => {
  it("active = union, unanimous = intersection for two long-tenured members", () => {
    const members: GroupMember[] = [
      { userId: "u1", joinedDay: "2024-01-01" },
      { userId: "u2", joinedDay: "2024-01-01" },
    ];
    const dayRows: MemberDay[] = [
      { userId: "u1", day: "2024-01-08" },
      { userId: "u1", day: "2024-01-09" },
      { userId: "u1", day: "2024-01-10" },
      { userId: "u2", day: "2024-01-09" }, // u2 missed the 8th
      { userId: "u2", day: "2024-01-10" },
    ];
    const out = buildGroupDaySets(members, dayRows);
    expect(out.activeDays).toEqual(["2024-01-08", "2024-01-09", "2024-01-10"]);
    expect(out.unanimousDays).toEqual(["2024-01-09", "2024-01-10"]);
  });

  it("computeStreaks turns those into a 3d active / 2d unanimous streak", () => {
    const out = buildGroupDaySets(
      [
        { userId: "u1", joinedDay: "2024-01-01" },
        { userId: "u2", joinedDay: "2024-01-01" },
      ],
      [
        { userId: "u1", day: "2024-01-08" },
        { userId: "u1", day: "2024-01-09" },
        { userId: "u1", day: "2024-01-10" },
        { userId: "u2", day: "2024-01-09" },
        { userId: "u2", day: "2024-01-10" },
      ],
    );
    expect(computeStreaks(out.activeDays, today).currentStreak).toBe(3);
    expect(computeStreaks(out.unanimousDays, today).currentStreak).toBe(2);
  });
});

describe("buildGroupDaySets — mid-streak join doesn't retroactively break unanimous", () => {
  it("excuses a new member from days before their joinedDay", () => {
    // u1 has burned every day from Jan 1 through Jan 10.
    // u2 just joined on Jan 9 and has burned Jan 9 + Jan 10.
    // u2's absence on Jan 1-8 should NOT break the unanimous streak —
    // those days predate their join.
    const members: GroupMember[] = [
      { userId: "u1", joinedDay: "2024-01-01" },
      { userId: "u2", joinedDay: "2024-01-09" },
    ];
    const dayRows: MemberDay[] = [
      ...["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"].map((dd) => ({
        userId: "u1",
        day: `2024-01-${dd}`,
      })),
      { userId: "u2", day: "2024-01-09" },
      { userId: "u2", day: "2024-01-10" },
    ];
    const out = buildGroupDaySets(members, dayRows);
    // active = u1's full run
    expect(out.activeDays.length).toBe(10);
    // unanimous = every day from Jan 1 through Jan 10 (u2 excused before
    // Jan 9, present on Jan 9 + 10)
    expect(out.unanimousDays).toEqual([
      "2024-01-01",
      "2024-01-02",
      "2024-01-03",
      "2024-01-04",
      "2024-01-05",
      "2024-01-06",
      "2024-01-07",
      "2024-01-08",
      "2024-01-09",
      "2024-01-10",
    ]);
    expect(computeStreaks(out.unanimousDays, today).currentStreak).toBe(10);
  });

  it("breaks unanimous when an existing member misses a day", () => {
    // u1 + u2 both joined Jan 1. u1 misses Jan 9. Unanimous streak is broken.
    const members: GroupMember[] = [
      { userId: "u1", joinedDay: "2024-01-01" },
      { userId: "u2", joinedDay: "2024-01-01" },
    ];
    const dayRows: MemberDay[] = [
      { userId: "u1", day: "2024-01-08" },
      { userId: "u1", day: "2024-01-10" }, // missed yesterday
      { userId: "u2", day: "2024-01-08" },
      { userId: "u2", day: "2024-01-09" },
      { userId: "u2", day: "2024-01-10" },
    ];
    const out = buildGroupDaySets(members, dayRows);
    expect(out.activeDays).toEqual(["2024-01-08", "2024-01-09", "2024-01-10"]);
    expect(out.unanimousDays).toEqual(["2024-01-08", "2024-01-10"]); // no 09
    // current streak from "2024-01-08, 2024-01-10": only 10 counts as today
    const result = computeStreaks(out.unanimousDays, today);
    expect(result.currentStreak).toBe(1);
    expect(result.longestStreak).toBe(1);
  });
});

describe("buildGroupDaySets — yesterday edge case", () => {
  it("treats a run ending yesterday as still-active", () => {
    const members: GroupMember[] = [{ userId: "u1", joinedDay: "2024-01-01" }];
    const dayRows: MemberDay[] = [
      { userId: "u1", day: "2024-01-08" },
      { userId: "u1", day: yesterday },
    ];
    const out = buildGroupDaySets(members, dayRows);
    expect(computeStreaks(out.activeDays, today).currentStreak).toBe(2);
  });
});
