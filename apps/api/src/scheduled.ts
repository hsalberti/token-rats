/**
 * Scheduled handler for Token Rats Worker.
 *
 * Wired from `index.ts`:
 *
 *   export default {
 *     fetch: app.fetch.bind(app),
 *     async scheduled(event, env, ctx) {
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
import { WEEK_MS } from "./lib/time.js";

interface EligibleUserRow {
  id: string;
  email: string;
  last_digest_sent_at: number | null;
}

/**
 * Weekly digest cron handler.
 *
 * - Pulls every user with `notification_prefs.weekly_digest = 1` AND a non-null
 *   `users.email`.
 * - Skips anyone whose `last_digest_sent_at` is within the last 6 days (idempotent
 *   per ISO week even if the cron fires twice).
 * - Builds the digest body via `lib/digest.ts` and ships through `lib/email.ts`,
 *   which falls back to a console-log stub when `EMAIL_PROVIDER_API_KEY` is unset.
 * - Per-user failures are caught + logged; one bad send must not poison the batch.
 *
 * Note: this is a single sequential loop. With our current scale that's fine; if
 * we ever cross ~hundreds of eligible users in one cron run we'll want to fan
 * out via Cloudflare Queues to stay inside the per-invocation subrequest budget.
 */
export async function runWeeklyDigests(env: Env): Promise<void> {
  const now = Date.now();
  // 6 days, not 7, so an early/late Monday tick still de-dupes a slow run.
  const skipIfSentAfter = now - WEEK_MS + 24 * 60 * 60 * 1000;

  const eligible = await env.DB.prepare(
    `SELECT u.id AS id, u.email AS email, np.last_digest_sent_at AS last_digest_sent_at
     FROM notification_prefs np
     JOIN users u ON u.id = np.user_id
     WHERE np.weekly_digest = 1
       AND u.email IS NOT NULL
       AND (np.last_digest_sent_at IS NULL OR np.last_digest_sent_at < ?)`,
  )
    .bind(skipIfSentAfter)
    .all<EligibleUserRow>();

  const rows = eligible.results ?? [];
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const digest = await buildWeeklyDigest(row.id, env.DB, {
        webOrigin: env.WEB_ORIGIN,
        signingKey: env.SESSION_SIGNING_KEY,
      });
      if (!digest) {
        skipped += 1;
        continue;
      }

      const result = await sendEmail(
        {
          to: row.email,
          subject: digest.subject,
          html: digest.html,
          text: digest.text,
        },
        env.EMAIL_PROVIDER_API_KEY,
      );

      if (!result.ok) {
        failed += 1;
        console.warn(`[digest] send failed for user=${row.id}: ${result.error ?? "unknown"}`);
        continue;
      }

      await env.DB.prepare(
        "UPDATE notification_prefs SET last_digest_sent_at = ? WHERE user_id = ?",
      )
        .bind(now, row.id)
        .run();
      sent += 1;
    } catch (err) {
      failed += 1;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[digest] threw for user=${row.id}: ${msg}`);
    }
  }

  console.log(
    `[digest] runWeeklyDigests done: eligible=${rows.length} sent=${sent} skipped=${skipped} failed=${failed}`,
  );
}
