/**
 * Scheduled handler for Token Rats Worker.
 *
 * Wire into apps/api/src/index.ts:
 *
 *   import { runWeeklyDigests } from "./scheduled.js";
 *
 *   // At the bottom of index.ts, replace `export default app;` with:
 *   export default {
 *     fetch: app.fetch.bind(app),
 *     async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
 *       ctx.waitUntil(runWeeklyDigests(env));
 *     },
 *   };
 *
 * The cron is declared in wrangler.toml:
 *   [triggers]
 *   crons = ["0 16 * * 1"]   # Mondays 16:00 UTC
 */

import type { Env } from "./env.js";

/**
 * Weekly digest cron handler.
 *
 * Currently a no-op: the `users` table has no real email column (the
 * previous implementation sent to `${user.handle}@example.com` via a stub
 * sendEmail that always returned ok, which logged success but delivered
 * nothing). Until the email column + a real ESP integration land, this
 * function is intentionally inert so the cron doesn't burn subrequests
 * pretending to work.
 *
 * To re-enable, restore the previous loop here and ensure:
 *   - `users.email` column exists (new migration).
 *   - `sendEmail` actually talks to an email provider.
 *   - The per-user loop is replaced by a Cloudflare Queues fan-out
 *     (the sequential `await sendEmail` will not scale past ~hundreds
 *     of users within the cron CPU/subrequest budget).
 */
export async function runWeeklyDigests(_env: Env): Promise<void> {
  console.warn("[scheduled] runWeeklyDigests: no-op — email delivery not wired up");
}
