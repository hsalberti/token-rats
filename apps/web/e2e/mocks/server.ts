/**
 * In-process msw `setupServer` for unit-style assertions on the handlers.
 *
 * Note: the live Playwright suite intercepts via the standalone server in
 * `standalone-server.mjs` (Next.js's server-side fetches need real HTTP). This
 * file exists so:
 *   1. handler logic can be exercised in isolation if needed,
 *   2. anyone reading the test setup sees the canonical msw pattern.
 */

import { setupServer } from "msw/node";
import { handlers } from "./handlers";

export const server = setupServer(...handlers);

/** Start the msw `setupServer` (idempotent). */
export function start() {
  server.listen({ onUnhandledRequest: "bypass" });
}

/** Reset to the default handler set. */
export function reset() {
  server.resetHandlers();
}

/** Stop the server. */
export function stop() {
  server.close();
}
