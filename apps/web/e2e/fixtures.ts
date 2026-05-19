/**
 * Playwright test fixtures for the Token Rats v1.2 smoke suite.
 *
 * Exposes:
 *   - `signedIn` page fixture that pre-seeds the `tr_session` cookie so the
 *     server-side `getSession()` succeeds.
 *   - `mswServer` test-scoped accessor to the in-process setupServer; it's
 *     auto-started and reset between tests so handler overrides stay local.
 *
 * The on-the-wire mocks are served by `mocks/standalone-server.mjs` (booted
 * by Playwright's `webServer` block) — see playwright.config.ts.
 */

import { test as base } from "@playwright/test";
import { reset, server, start, stop } from "./mocks/server";

interface Fixtures {
  mswServer: typeof server;
  signedIn: void;
}

export const test = base.extend<Fixtures, { _mswServer: typeof server }>({
  _mswServer: [
    // worker-scoped: start once, stop at the very end.
    async ({}, use) => {
      start();
      await use(server);
      stop();
    },
    { scope: "worker", auto: true },
  ],

  mswServer: async ({ _mswServer }, use) => {
    await use(_mswServer);
    reset();
  },

  signedIn: [
    async ({ context }, use) => {
      await context.addCookies([
        {
          name: "tr_session",
          value: "mock-session-token",
          domain: "localhost",
          path: "/",
          httpOnly: false,
          secure: false,
          sameSite: "Lax",
        },
      ]);
      await use();
    },
    { auto: false },
  ],
});

export { expect } from "@playwright/test";
