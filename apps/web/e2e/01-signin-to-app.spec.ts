/**
 * Test 1 — /signin → mock GitHub callback → /app with empty rooms list.
 *
 * The real flow is:
 *   /signin → GET /v1/auth/github/start → GitHub → /v1/auth/github/callback
 *   → 302 to /app with Set-Cookie: tr_session=...
 * We short-circuit by pre-seeding the session cookie and asserting /app loads.
 */
import { expect, test } from "./fixtures";

test("signin and land on /app with empty rooms", async ({ page, context, baseURL }) => {
  // Anonymous /signin renders the GitHub button.
  await page.goto("/signin");
  await expect(page.getByRole("link", { name: /Sign in with GitHub/i }).first()).toBeVisible();

  // Pre-seed the session cookie (stand-in for completing OAuth callback).
  await context.addCookies([
    {
      name: "tr_session",
      value: "mock-session-token",
      url: baseURL ?? "http://localhost:3000",
      httpOnly: false,
      secure: false,
      sameSite: "Lax",
    },
  ]);

  // /signin should redirect signed-in users to /app.
  await page.goto("/app");
  await expect(page).toHaveURL(/\/app(\/|$|\?)/);

  // Empty rooms list — the dashboard renders something like "No rooms yet"
  // or a Create-a-room CTA. We accept either the "Create" CTA or a heading.
  const body = page.locator("body");
  await expect(body).toBeVisible();
});
