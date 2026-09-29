import type { Env } from "../env.js";
import { sendEmail } from "./email.js";
import { connectedSql, readableSql } from "./friendship.js";
import { notificationInsert } from "./setups.js";

export async function monthlyMilestones(env: Env, userId: string, now = Date.now()) {
  const actor = await env.DB.prepare("SELECT handle FROM users WHERE id=?")
    .bind(userId)
    .first<{ handle: string }>();
  if (!actor) return;
  const totals = await env.DB.prepare(
    "SELECT substr(day,1,7) AS month,SUM(tokens) AS tokens FROM daily_rollup WHERE user_id=? GROUP BY substr(day,1,7) ORDER BY month",
  )
    .bind(userId)
    .all<{ month: string; tokens: number }>();
  const current = new Date(now).toISOString().slice(0, 7);
  // Claim every threshold once across all months. Historical imports establish a silent baseline.
  const pref = await env.DB.prepare("SELECT share_milestones FROM social_prefs WHERE user_id=?")
    .bind(userId)
    .first<{ share_milestones: number }>();
  const statements = [];
  for (const threshold of [1_000_000, 10_000_000, 100_000_000]) {
    const month = totals.results.find((t) => t.tokens >= threshold)?.month;
    if (!month) continue;
    const claim = crypto.randomUUID();
    statements.push(
      env.DB.prepare(
        "INSERT OR IGNORE INTO monthly_milestones(user_id,threshold,month,event_id,achieved_at) VALUES(?,?,?,?,?)",
      ).bind(userId, threshold, month, claim, now),
    );
    if (month === current && pref?.share_milestones !== 0)
      statements.push(
        notificationInsert(env, {
          actorId: userId,
          key: `monthly:${userId}:${threshold}`,
          kind: "milestone",
          title: `@${actor.handle} reached ${threshold / 1_000_000}M tokens in a month for the first time (${month})`,
          href: `/u/${actor.handle}`,
          now,
          claim,
        }),
      );
  }
  if (statements.length) await env.DB.batch(statements);
}
const encoder = new TextEncoder();
async function signature(env: Env, userId: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(env.SESSION_SIGNING_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const data = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`social-unsubscribe:${userId}`),
  );
  return Array.from(new Uint8Array(data), (x) => x.toString(16).padStart(2, "0")).join("");
}
export async function unsubscribeToken(env: Env, userId: string) {
  return `${btoa(userId)}.${await signature(env, userId)}`;
}
export async function unsubscribeUser(env: Env, token: string) {
  try {
    const [encoded, sig] = token.split(".");
    if (!encoded) return null;
    const id = atob(encoded);
    const expected = await signature(env, id);
    if (!sig || sig.length !== expected.length) return null;
    let mismatch = 0;
    for (let i = 0; i < sig.length; i++) mismatch |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
    return mismatch === 0 ? id : null;
  } catch {
    return null;
  }
}
export const LIVE_NOTICE = `${connectedSql("n.user_id", "a.id")}
 AND (n.kind='milestone' AND a.public_profile=1 AND COALESCE((SELECT share_milestones FROM social_prefs WHERE user_id=n.actor_id),1)=1
 OR n.kind='setup' AND EXISTS(SELECT 1 FROM setup_versions v WHERE v.id=n.version_id AND ${readableSql("v", "a", "n.user_id")}))`;
export async function deliverSocialEmails(env: Env, now = Date.now()) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return { sent: 0, configured: false };
  const rows = await env.DB.prepare(
    `SELECT n.*,u.email FROM social_notifications n JOIN users u ON u.id=n.user_id WHERE n.email_state='pending' AND n.next_attempt_at<=? ORDER BY n.created_at LIMIT 10`,
  )
    .bind(now)
    .all<{
      id: string;
      user_id: string;
      actor_id: string;
      kind: string;
      title: string;
      href: string;
      email: string | null;
      attempts: number;
      created_at: number;
    }>();
  let sent = 0;
  for (const row of rows.results) {
    const pref = row.kind === "setup" ? "setup_emails" : "milestone_emails";
    const allowed = await env.DB.prepare(
      `SELECT 1 FROM social_notifications n JOIN users a ON a.id=n.actor_id JOIN social_prefs p ON p.user_id=n.user_id WHERE n.id=? AND p.${pref}=1 AND ${LIVE_NOTICE}
      AND NOT EXISTS(SELECT 1 FROM email_suppressions e JOIN users recipient ON recipient.email=e.email WHERE recipient.id=n.user_id AND e.reason<>'unsubscribe')`,
    )
      .bind(row.id)
      .first();
    if (!allowed || !row.email || now - row.created_at > 24 * 60 * 60 * 1000) {
      await env.DB.prepare("UPDATE social_notifications SET email_state='cancelled' WHERE id=?")
        .bind(row.id)
        .run();
      continue;
    }
    // Lease the queue item before network I/O; provider idempotency covers a crash after send.
    const lease = await env.DB.prepare(
      "UPDATE social_notifications SET next_attempt_at=?,attempts=attempts+1 WHERE id=? AND email_state='pending' AND next_attempt_at<=?",
    )
      .bind(now + 300_000, row.id, now)
      .run();
    if (!lease.meta.changes) continue;
    const url = new URL(row.href, env.WEB_ORIGIN).toString();
    const apiOrigin =
      env.WEB_ORIGIN.includes("localhost") || env.WEB_ORIGIN.includes("127.0.0.1")
        ? "http://127.0.0.1:8788"
        : "https://api.tokenrats.com";
    const unsubscribe = `${apiOrigin}/v1/social/unsubscribe?token=${encodeURIComponent(await unsubscribeToken(env, row.user_id))}`;
    const result = await sendEmail(env, {
      to: row.email,
      subject: row.title,
      text: `${row.title}\n\nSee it on Token Rats: ${url}\n\nYou're receiving this because you opted into updates from people you follow.\nEmail preferences: ${env.WEB_ORIGIN}/app/notifications\nUnsubscribe: ${unsubscribe}`,
      unsubscribe,
      key: `social-${row.id}`,
    });
    if (result.ok) {
      sent++;
      await env.DB.prepare("UPDATE social_notifications SET email_state='sent' WHERE id=?")
        .bind(row.id)
        .run();
    } else
      await env.DB.prepare(
        "UPDATE social_notifications SET email_state=?,next_attempt_at=? WHERE id=?",
      )
        .bind(
          row.attempts >= 5 ? "failed" : "pending",
          now + Math.min(3600000, 300000 * 2 ** row.attempts),
          row.id,
        )
        .run();
  }
  return { sent, configured: true };
}
