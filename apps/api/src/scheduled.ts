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
import { buildWeeklyDigest } from "./lib/digest.js";
import { sendEmail } from "./lib/email.js";

/**
 * Send weekly digest emails to all users who have:
 *   - weekly_digest = 1 in notification_prefs (or no row = default enabled)
 *   - an email address on file (currently stored as their GitHub login handle;
 *     a real email column would be needed for production)
 *
 * For now we iterate over all users who have data in daily_rollup in the past
 * 7 days and whose notification_prefs allow weekly digests.
 *
 * TODO: Add an `email` column to `users` (migration 0004) and use it here.
 * Currently we log a TODO per user since we can't email without an address.
 */
export async function runWeeklyDigests(env: Env): Promise<void> {
  console.log("[scheduled] runWeeklyDigests: starting");

  // Find users eligible for a digest:
  // - Have daily_rollup data in the last 7 days
  // - Have not opted out (weekly_digest = 0)
  const cutoffDay = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const usersResult = await env.DB.prepare(
    `SELECT DISTINCT u.id, u.handle
     FROM users u
     JOIN daily_rollup dr ON dr.user_id = u.id
     LEFT JOIN notification_prefs np ON np.user_id = u.id
     WHERE dr.day >= ?
       AND (np.weekly_digest IS NULL OR np.weekly_digest = 1)`,
  )
    .bind(cutoffDay)
    .all<{ id: string; handle: string }>();

  const users = usersResult.results ?? [];
  console.log(`[scheduled] Found ${users.length} users eligible for weekly digest`);

  let sent = 0;
  let skipped = 0;

  for (const user of users) {
    const digest = await buildWeeklyDigest(user.id, env.DB);
    if (!digest) {
      skipped++;
      continue;
    }

    // TODO: Replace `${user.handle}@example.com` with the real user email
    // once an `email` column is added to the `users` table.
    console.log(
      `[scheduled] TODO: send digest to user ${user.handle} (no email column yet). Subject: ${digest.subject}`,
    );

    const result = await sendEmail({
      to: `${user.handle}@example.com`, // TODO: use real email
      subject: digest.subject,
      html: digest.html,
      text: digest.text,
    });

    if (result.ok) {
      sent++;
    } else {
      console.error(`[scheduled] Failed to send digest to ${user.handle}:`, result.error);
    }
  }

  console.log(`[scheduled] runWeeklyDigests: done — sent=${sent} skipped=${skipped}`);
}
