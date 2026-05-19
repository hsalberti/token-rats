/**
 * Playwright test fixtures for the Token Rats v1.2 smoke suite.
 *
 * The on-the-wire mocks are served by `mocks/standalone-server.mjs` (booted
 * by Playwright's `webServer` block — see playwright.config.ts). The msw
 * `setupServer` exported from `./mocks/server.ts` exists for unit-style
 * handler tests and is intentionally NOT auto-started here: starting it would
 * make msw intercept Playwright's own `request` fixture (used by the OG card
 * tests), which the in-process interceptor crashes on.
 *
 * Exposes:
 *   - `signedIn` — pre-seeds the `tr_session` cookie so server-side
 *     `getSession()` calls succeed.
 */

import { test as base } from "@playwright/test";

interface Fixtures {
  signedIn: undefined;
}

export const test = base.extend<Fixtures>({
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
      await use(undefined);
    },
    { auto: false },
  ],
});

export { expect } from "@playwright/test";
