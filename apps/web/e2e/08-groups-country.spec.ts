/**
 * Test 8 — `/groups` filters by `cf-ipcountry`. With BR header, viewer sees
 * BR rooms but not US rooms (Track AE).
 */
import { expect, test } from "./fixtures";

test.use({ extraHTTPHeaders: { "cf-ipcountry": "BR" } });

test("groups page filters by cf-ipcountry header", async ({ page }) => {
  await page.goto("/groups");
  // Viewer country acknowledged.
  await expect(page.getByText(/Brazil/i).first()).toBeVisible();
  // BR room present.
  await expect(page.getByText(/Brazil Builders/i).first()).toBeVisible();
  // US room must NOT appear.
  await expect(page.getByText(/US Top Coders/i)).toHaveCount(0);
});
