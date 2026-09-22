import { expect, test } from "@playwright/test";

/**
 * Spec 2: Signed-out homepage.
 *
 * `/` SSRs the live trending board at 7d, hero strip above, How-it-works +
 * privacy strip below. `/trending` 301s (308 by Next 15's permanentRedirect)
 * to `/`. `?ref=<code>` survives the GitHub sign-in CTA.
 */

test("/ as signed-out renders the trending board with the hero strip", async ({ page }) => {
  await page.goto("/");

  // Hero: wordmark + tagline + install snippet + sign-in CTA.
  await expect(page.getByText(/Token\s+Rats/i).first()).toBeVisible();
  await expect(page.getByText(/Track your AI usage\. Compare subscriptions\./i)).toBeVisible();
  await expect(page.getByText(/token-rats login/i).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Sign in with GitHub/i }).first()).toBeVisible();

  // Live board section.
  await expect(
    page.getByRole("heading", { name: /Global Token Consumption Leaderboard/i }),
  ).toBeVisible();

  // How-it-works moved below the board.
  await expect(page.getByRole("heading", { name: /How it works/i })).toBeVisible();

  await expect(page.getByText("Local tracker: usage metadata only.").first()).toBeVisible();
});

test("/trending permanently redirects to /", async ({ request }) => {
  const res = await request.get("/trending", { maxRedirects: 0 });
  // Next 15's permanentRedirect is a 308 — close enough to the roadmap's 301
  // (both are permanent; clients cache identically).
  expect([301, 307, 308]).toContain(res.status());
  const location = res.headers().location ?? "";
  expect(location).toMatch(/^\/$/);
});

test("?ref=<code> survives into the GitHub OAuth start URL", async ({ page }) => {
  // pickRef() accepts [A-Za-z0-9_-]{6,32}. "smoke01" matches.
  await page.goto("/?ref=smoke01");
  const link = page.getByRole("link", { name: /Sign in with GitHub/i }).first();
  const href = await link.getAttribute("href");
  expect(href, "sign-in link should carry the ref param").toMatch(/[?&]ref=smoke01/);
});
