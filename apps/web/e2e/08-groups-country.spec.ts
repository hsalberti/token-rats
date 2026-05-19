/**
 * Test 8 — `/groups` filters by `cf-ipcountry`. With BR header, viewer sees
 * BR rooms but not US rooms (Track AE).
 *
 * Playwright's `extraHTTPHeaders` applies to browser-initiated requests, but
 * the `/groups` page is a server component whose API fetch only forwards
 * cookies. We carry the country via the `tr_country_test` cookie which our
 * mock handler honours just like the real `cf-ipcountry` header.
 */
import { expect, test } from "./fixtures";

test.use({ extraHTTPHeaders: { "cf-ipcountry": "BR" } });

test("groups page filters by cf-ipcountry header", async ({ page, context }) => {
  await context.addCookies([
    {
      name: "tr_country_test",
      value: "BR",
      domain: "localhost",
      path: "/",
      sameSite: "Lax",
    },
  ]);
  await page.goto("/groups");
  // Viewer country acknowledged.
  await expect(page.getByText(/Brazil/i).first()).toBeVisible();
  // BR room present.
  await expect(page.getByText(/Brazil Builders/i).first()).toBeVisible();
  // US room must NOT appear.
  await expect(page.getByText(/US Top Coders/i)).toHaveCount(0);
});
