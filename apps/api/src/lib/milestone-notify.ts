/**
 * On-ingest "milestone" web-push notification.
 *
 * When a user's lifetime token total crosses a round threshold (1M, 10M, …)
 * we fire a single celebratory web push. This lights up the otherwise-dark
 * push delivery path on the busiest authenticated codepath (ingest) without
 * any cross-user diffing — it is deterministic, idempotent, and bounded:
 *
 *   - At most one push per ingest (the largest newly-crossed threshold).
 *   - Each (user, milestone) pair is recorded in `notification_milestones`, so
 *     a milestone is never delivered twice even under concurrent ingests.
 *   - Gated by the user's `passed` notification preference (the competitive /
 *     bragging-rights toggle — the closest existing pref; default on).
 *
 * Everything here runs inside `ctx.waitUntil` and swallows its own errors, so
 * a push outage can never affect ingest latency or correctness.
 */

import type { Env } from "../env.js";
import { sendWebPush } from "./webpush.js";

/** Round lifetime-token milestones, ascending. */
const MILESTONES = [
  1_000_000, 10_000_000, 50_000_000, 100_000_000, 500_000_000, 1_000_000_000,
] as const;

function fmtMilestone(n: number): string {
  if (n >= 1_000_000_000) return `${n / 1_000_000_000}B`;
  return `${n / 1_000_000}M`;
}

/**
 * Returns the highest milestone the user just crossed with this ingest, or
 * null if none. `before` is the lifetime total prior to this ingest, `after`
 * the total including it.
 */
export function crossedMilestone(before: number, after: number): number | null {
  let crossed: number | null = null;
  for (const m of MILESTONES) {
    if (before < m && after >= m) crossed = m;
  }
  return crossed;
}

/**
 * Best-effort: detect a milestone crossing for `userId` and, if found and
 * not already sent, deliver a single web push to all of the user's devices.
 *
 * `addedTokens` is the token delta from this ingest (already deduped to newly
 * inserted sessions by the caller).
 */
export async function maybeNotifyMilestone(
  env: Env,
  userId: string,
  addedTokens: number,
): Promise<void> {
  if (addedTokens <= 0) return;

  const totalRow = await env.DB.prepare(
    "SELECT COALESCE(SUM(tokens), 0) AS total FROM daily_rollup WHERE user_id = ?",
  )
    .bind(userId)
    .first<{ total: number }>();

  const after = totalRow?.total ?? 0;
  const before = after - addedTokens;

  const milestone = crossedMilestone(before, after);
  if (milestone === null) return;

  // Respect the user's preference (default on when no row exists).
  const prefRow = await env.DB.prepare("SELECT passed FROM notification_prefs WHERE user_id = ?")
    .bind(userId)
    .first<{ passed: number }>();
  if (prefRow && prefRow.passed !== 1) return;

  // Claim the milestone atomically — INSERT OR IGNORE makes this safe under
  // concurrent ingests; only the winning insert proceeds to send.
  const claim = await env.DB.prepare(
    "INSERT OR IGNORE INTO notification_milestones (user_id, milestone, sent_at) VALUES (?, ?, ?)",
  )
    .bind(userId, milestone, Date.now())
    .run();
  if (claim.meta.changes === 0) return; // already sent

  const subs = await env.DB.prepare(
    "SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?",
  )
    .bind(userId)
    .all<{ endpoint: string; p256dh: string; auth: string }>();
  if (!subs.results || subs.results.length === 0) return;

  const payload = {
    title: "Token Rats 🐀",
    body: `You just crossed ${fmtMilestone(milestone)} lifetime tokens. Certified rat.`,
    url: "/app",
  };
  const vapidSubject = `mailto:noreply@${new URL(env.WEB_ORIGIN).hostname}`;

  for (const sub of subs.results) {
    const res = await sendWebPush(
      sub,
      payload,
      env.VAPID_PRIVATE_KEY,
      env.VAPID_PUBLIC_KEY,
      vapidSubject,
    );
    if (!res.ok && res.reason === "gone") {
      await env.DB.prepare("DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?")
        .bind(userId, sub.endpoint)
        .run()
        .catch(() => undefined);
    }
  }
}
