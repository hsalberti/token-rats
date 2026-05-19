/**
 * Test 6 — `/settings/profile` shows "Connect Twitter / X" when not verified.
 * Mock OAuth callback (`?twitter=connected`) flips the UI to verified
 * + disconnect button (Track AC).
 */
import { expect, test } from "./fixtures";

test("twitter oauth toggles verified state in settings", async ({ page, context, signedIn }) => {
  void signedIn;
  await page.goto("/settings/profile");
  await expect(page.getByRole("heading", { name: /Profile Settings/i })).toBeVisible();

  // Unverified state — connect button visible.
  const connect = page
    .getByRole("button", { name: /connect twitter|connect x/i })
    .or(page.getByRole("link", { name: /connect twitter|connect x/i }));
  await expect(connect.first()).toBeVisible();

  // Flip our test cookie hint so /v1/me returns verified=true after reload.
  await context.addCookies([
    {
      name: "twitter_test",
      value: "verified",
      domain: "localhost",
      path: "/",
      sameSite: "Lax",
    },
  ]);
  await page.goto("/settings/profile?twitter=connected");

  // Verified pill + disconnect option.
  await expect(
    page
      .getByRole("button", { name: /disconnect/i })
      .or(page.getByText(/@ratking_x/i))
      .first(),
  ).toBeVisible();
});
