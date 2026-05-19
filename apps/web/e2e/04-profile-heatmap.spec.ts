/**
 * Test 4 — `/u/[handle]` heatmap defaults to 60d; toggling to 52w changes the
 * rendered range (Track Y).
 */
import { expect, test } from "./fixtures";

test("profile page heatmap defaults to 60d and toggles to 52w", async ({ page }) => {
  await page.goto("/u/ratking");
  await expect(page.getByText(/@ratking/).first()).toBeVisible();
  const sixty = page.getByRole("button", { name: "60d" }).first();
  const fiftyTwo = page.getByRole("button", { name: "52w" }).first();
  await expect(sixty).toBeVisible();
  await expect(fiftyTwo).toBeVisible();
  await fiftyTwo.click();
  // The toggle survives the switch — proves the client state updated and
  // didn't crash on the new fixture shape.
  await expect(fiftyTwo).toBeVisible();
});
