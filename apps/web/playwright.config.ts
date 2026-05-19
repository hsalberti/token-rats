import { defineConfig, devices } from "@playwright/test";

/**
 * Token Rats v1.2 — Track AI Playwright smoke suite.
 *
 * Strategy:
 *   - We stand up the Next.js dev server and a standalone mock API server on
 *     port 8787. The mock server consumes the msw `http.*` handlers from
 *     `e2e/mocks/handlers.ts` and replays them over real HTTP so that
 *     server-component fetches from the Next.js process get intercepted too.
 *   - Tests run serially with a single worker to keep the "stop on first
 *     failure" ordering deterministic (see roadmap-v1.2.md Track AI).
 *   - 30s timeout per test, 0 retries. Whole suite budget: <90s.
 */
const PORT = Number(process.env.PORT ?? 3000);
const MOCK_API_PORT = Number(process.env.MOCK_API_PORT ?? 8787);
const BASE_URL = `http://localhost:${PORT}`;
const MOCK_API_URL = `http://localhost:${MOCK_API_PORT}`;

export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["**/mocks/**", "**/fixtures.ts"],
  timeout: 30_000,
  retries: 0,
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 5_000,
    navigationTimeout: 15_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "node --experimental-strip-types --no-warnings ./e2e/mocks/standalone-server.mjs",
      port: MOCK_API_PORT,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 10_000,
    },
    {
      command: "pnpm dev",
      port: PORT,
      reuseExistingServer: !process.env.CI,
      env: {
        NEXT_PUBLIC_API_URL: MOCK_API_URL,
        NODE_ENV: "development",
      },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 60_000,
    },
  ],
});
