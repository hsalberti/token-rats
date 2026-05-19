import { expect, test } from "@playwright/test";

/**
 * Spec 9: Country-locked groups.
 *
 * The full version injects cf-ipcountry, creates a public room as a DE
 * user, verifies a US user sees the country pill at /r/<code> instead of
 * the join CTA, and /groups lists the room for DE but not for US.
 *
 * BLOCKED on the wrangler harness — needs to seed two users with mocked
 * `cf-ipcountry` headers and a public room with country='DE'. The static
 * pieces (route exists, renders without auth) are checked here.
 */

test("/groups renders without an authed user", async ({ page }) => {
  await page.goto("/groups");
  await expect(page.getByRole("heading", { name: /Public groups/i })).toBeVisible();
});

test.skip("seeded DE public room: US viewer sees the country pill", async () => {
  // INTENDED:
  //   - Boot harness, seed DE user + their public room (country='DE').
  //   - Open a US-context page (cf-ipcountry header US).
  //   - Visit /r/<seeded-code>.
  //   - Assert stat strip visible.
  //   - Assert "For viewers in 🇩🇪 Germany" pill present, no Join button.
  //   - Visit /groups → assert seeded room is NOT listed (US country, no rooms).
});
