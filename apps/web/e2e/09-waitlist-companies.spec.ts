/**
 * Test 9 — `/waitlist/companies` submits and shows the queue position
 * (Track AA).
 */
import { expect, test } from "./fixtures";

test("companies waitlist submission shows queue position", async ({ page }) => {
  await page.goto("/waitlist/companies");
  await page.getByLabel(/work email/i).fill("ceo@example.com");
  await page.getByLabel(/use case/i).fill("Track our engineering team's AI burn");
  await page.getByRole("button", { name: /get on the list|submitting/i }).click();
  // Mocked response returns position 23.
  await expect(page.getByText(/#23/)).toBeVisible({ timeout: 10_000 });
});
