import { test, expect } from "@playwright/test";

/**
 * Spec 3: Heatmap range toggle.
 *
 * `/u/<handle>` and `/r/<code>` default to 30d; clicking the 52w toggle
 * swaps the data live and updates `?range=` in the URL.
 *
 * Real assertion requires a seeded user + room — see the wrangler harness
 * scaffold. Without it, we verify the URL-sync contract by hitting a
 * profile that we know responds (any public handle returned by /v1/trending
 * works; we read it from /v1/trending to avoid hard-coding).
 *
 * SKIP if no public profiles are available — the page would render the
 * "private" state and the toggle wouldn't appear.
 */

test("heatmap toggle swaps `?range=` on a public profile", async ({ page, request }) => {
  const trendingRes = await request.get("/api/v1/trending?range=7d").catch(() => null);
  if (!trendingRes || !trendingRes.ok()) {
    test.skip(true, "No trending API on the web origin; harness work needed.");
  }
  const trending = (await trendingRes?.json()) as { rows?: Array<{ handle: string }> };
  const firstHandle = trending.rows?.[0]?.handle;
  if (!firstHandle) {
    test.skip(true, "No public profiles available in this environment.");
    return;
  }

  await page.goto(`/u/${firstHandle}`);

  // Default — 30d.
  const toggle52 = page.getByRole("button", { name: /52 weeks/i });
  if (!(await toggle52.isVisible().catch(() => false))) {
    test.skip(true, "Heatmap not rendered for this profile (no synced data).");
  }

  await toggle52.click();
  // Wait for URL update from history.replaceState.
  await expect.poll(async () => new URL(page.url()).searchParams.get("range")).toBe("52w");

  // Flip back to 30d — bare URL (no `?range=`).
  await page.getByRole("button", { name: /30 days/i }).click();
  await expect.poll(async () => new URL(page.url()).searchParams.get("range")).toBe(null);
});
