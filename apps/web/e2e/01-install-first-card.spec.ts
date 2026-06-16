import { expect, test } from "@playwright/test";

/**
 * Spec 1: Install → first card.
 *
 * Smoke test the install snippet on `/` and the OG share-card render path.
 * The full version runs `npx token-rats login`, syncs a fixture log, asserts
 * the leaderboard row + OG card render — that needs the wrangler harness +
 * a real CLI subprocess. Until the harness lands (see _setup/wrangler-harness.ts),
 * this spec verifies the static surface the human path depends on.
 */

test("homepage exposes the install snippet that callers will copy", async ({ page }) => {
  await page.goto("/");

  // The InstallBlock renders the canonical `token-rats login` line.
  // We assert it's *visible*, not just in the DOM — the install snippet is
  // the conversion CTA for new users.
  const code = page.getByText(/token-rats login/i);
  await expect(code.first()).toBeVisible();
});

test("share-card route /cards/trending/7d responds with an image", async ({ request }) => {
  const res = await request.get("/cards/trending/7d");
  expect(res.ok()).toBeTruthy();
  const contentType = res.headers()["content-type"] ?? "";
  expect(contentType).toMatch(/image\//);
});
