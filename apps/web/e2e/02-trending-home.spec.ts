/**
 * Test 2 — `/` (signed-out) renders the live trending board with three range
 * tabs (Track Z).
 */
import { expect, test } from "./fixtures";

test("signed-out home renders trending with today/7d/30d tabs", async ({ page }) => {
  await page.goto("/");
  // Hero headline.
  await expect(page.getByRole("heading", { name: /Strava for AI token burn/i })).toBeVisible();
  // Section heading proves the trending board mounted.
  await expect(page.getByRole("heading", { name: /Trending Rats/i })).toBeVisible();
  // The three range tabs.
  for (const label of ["Today", "7 days", "30 days"]) {
    await expect(page.getByRole("button", { name: label })).toBeVisible();
  }
  // At least one mocked row by handle.
  await expect(page.getByText("ratking").first()).toBeVisible();
});
