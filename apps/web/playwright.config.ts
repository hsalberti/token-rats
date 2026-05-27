import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright smoke suite for Token Rats — v1.2 feature #8.
 *
 * Specs run against a locally-running stack:
 *   - `apps/web` on port 3000 (`pnpm --filter @token-rats/web dev`)
 *   - `apps/api` on port 8787 (`pnpm --filter @token-rats/api dev`)
 *
 * The roadmap calls for a per-spec wrangler dev + fresh D1 harness; that
 * harness lives in `e2e/_setup/wrangler-harness.ts` and is currently a
 * scaffold (see implementation-notes.md for the gap). The specs that
 * don't need seeded data run against the shared dev servers.
 *
 * Browser matrix: Chromium, Firefox, desktop WebKit, and mobile WebKit.
 * Mobile WebKit approximates iPhone Safari from Linux; it is not a real
 * iPhone device run. Use a device cloud or an actual phone on the LAN for
 * hardware Safari checks.
 */

const WEB_BASE_URL = process.env.PLAYWRIGHT_WEB_BASE_URL ?? "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["**/_setup/**"],
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: WEB_BASE_URL,
    trace: process.env.CI ? "retain-on-failure" : "off",
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },
  // `webServer` is intentionally NOT configured here. Use it (or run
  // `pnpm dev` in another shell) before invoking `pnpm e2e`. See
  // `apps/web/README.md` for the runbook.
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "mobile-webkit",
      use: { ...devices["iPhone 15"] },
    },
  ],
});
