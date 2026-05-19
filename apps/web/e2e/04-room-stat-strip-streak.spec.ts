import { test } from "@playwright/test";

/**
 * Spec 4: Room stat strip + group streak.
 *
 * `/r/<code>` shows Members · 30d tokens · 30d cost; group-streak pill
 * reflects the ≥1-member-active-day rule with a seeded fixture.
 *
 * BLOCKED on the wrangler-dev harness — needs a seeded room with a known
 * daily_rollup history so the streak count is deterministic. See
 * implementation-notes.md (Feature #8). Skipped until the harness lands.
 */

test.skip(true, "Needs wrangler harness with seeded daily_rollup fixtures.");

test("seeded room shows expected stat strip + group streak pill", async ({ page: _page }) => {
  // INTENDED:
  //   - Boot harness with migrations applied.
  //   - Seed: 1 room, 3 members, daily_rollup rows for the past 7 days for each member.
  //   - GET /r/<seeded-code>.
  //   - Assert "Members · 3", "30d tokens · 4.2K" (whatever the fixture sums to).
  //   - Assert the streak pill reads "7-day group streak".
});
