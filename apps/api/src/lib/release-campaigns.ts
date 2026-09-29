import { CURRENT_RELEASE, type CampaignReport } from "@token-rats/contracts";
import { z } from "zod";
import type { Env } from "../env.js";
import { sendEmail } from "./email.js";

const DAY = 86_400_000;
export const CAMPAIGN_ID = CURRENT_RELEASE.id;

export function releaseEmail(origin: string, apiOrigin: string, recipientId: string) {
  const link = `${apiOrigin}/v1/releases/email/${recipientId}`;
  const unsubscribe = `${apiOrigin}/v1/releases/unsubscribe/${recipientId}`;
  const paragraphs = [
    "Hi, it's Alberti, founder of Token Rats.",
    "I've been changing my agent instructions and tools constantly. I wanted a place to remember what I tried, see what my friends are changing, and keep the experiments that didn't work out too.",
    "Token Rats now gives your setup a history:",
  ];
  const features = [
    "See the actual lines your friends added or removed from AGENTS.md, right in your feed. Give a change kudos when you like it.",
    "Save versions of your instructions, tools, models, and subscriptions. Compare versions, restore an older one, and rate setups you've tried.",
    "Let your coding agent capture a reproducible setup for you with the copyable skill in My setups.",
    "Optionally track global AGENTS.md changes automatically with npx token-rats@latest setup-track. Preview and confirm first. Automatic versions are shared only with friends: people you follow who follow you back, or people on a private board with you. Pause anytime in My setups.",
    "Track local Claude Code, Codex, OpenCode, and Cursor usage with npx token-rats@latest login. Your stats and leaderboards are still here.",
  ];
  const footer =
    "You're receiving this product update because you have a Token Rats account. We measure email opens, link clicks, and tracker activation to understand whether updates are useful. Friend emails are optional in Notifications.";
  const text = [
    ...paragraphs,
    ...features.map((f) => `• ${f}`),
    `Come back and try it: ${link}`,
    "The code is public: https://github.com/hsalberti/token-rats",
    "— Alberti",
    footer,
    `Unsubscribe from product updates: ${unsubscribe}`,
  ].join("\n\n");
  const html = `<!doctype html><html lang="en"><body style="margin:0;background:#f4f4f5;color:#18181b;font-family:Arial,sans-serif"><main style="max-width:580px;margin:24px auto;padding:32px;background:#fff;border-radius:16px"><a href="${origin}" style="font-weight:800;color:#18181b;text-decoration:none">TOKEN RATS</a><h1 style="font-size:28px;line-height:1.2">${CURRENT_RELEASE.title}</h1>${paragraphs.map((p) => `<p style="line-height:1.6">${p}</p>`).join("")}<ul style="padding-left:22px">${features.map((f) => `<li style="line-height:1.6;margin-bottom:14px">${f}</li>`).join("")}</ul><p style="margin:28px 0"><a href="${link}" style="display:inline-block;background:#f59e0b;color:#18181b;font-weight:bold;text-decoration:none;padding:14px 22px;border-radius:9px">See what's new →</a></p><p>Our code is <a href="https://github.com/hsalberti/token-rats">public on GitHub</a>.</p><p>— Alberti</p><hr style="border:0;border-top:1px solid #e4e4e7;margin:28px 0"><p style="font-size:12px;line-height:1.6;color:#71717a">${footer}</p><a href="${unsubscribe}" style="font-size:12px;color:#52525b">Unsubscribe from product updates</a></main></body></html>`;
  return { subject: CURRENT_RELEASE.subject, text, html, unsubscribe };
}

/** Immutable audience snapshot. Repeated calls never add recipients or resend. */
export async function prepareCampaign(env: Env) {
  if (await env.DB.prepare("SELECT 1 FROM release_campaigns WHERE id=?").bind(CAMPAIGN_ID).first())
    return;
  const users = await env.DB.prepare(`SELECT u.id,u.email,
    COALESCE(p.enabled,1) AS enabled,
    EXISTS(SELECT 1 FROM email_suppressions e WHERE e.email=TRIM(u.email)) AS suppressed,
    (EXISTS(SELECT 1 FROM devices d WHERE d.user_id=u.id) OR EXISTS(SELECT 1 FROM sessions s WHERE s.user_id=u.id)) AS had_usage,
    EXISTS(SELECT 1 FROM setup_watchers w WHERE w.user_id=u.id) AS had_setup
    FROM users u LEFT JOIN release_email_preferences p ON p.user_id=u.id ORDER BY u.created_at,u.id`).all<{
    id: string;
    email: string | null;
    enabled: number;
    suppressed: number;
    had_usage: number;
    had_setup: number;
  }>();
  let missing = 0;
  let excluded = 0;
  const seen = new Set<string>();
  const recipients = [];
  for (const user of users.results) {
    const email = user.email?.trim().toLowerCase() ?? "";
    if (!z.string().email().safeParse(email).success) {
      missing++;
      continue;
    }
    if (!user.enabled || user.suppressed || seen.has(email)) {
      excluded++;
      continue;
    }
    seen.add(email);
    recipients.push({ ...user, email });
  }
  // D1 batch is transactional: a concurrent preparation fails the unique campaign insert.
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO release_campaigns(id,release_id,created_at,audience_total,missing_email,excluded) VALUES(?,?,?,?,?,?)",
    ).bind(CAMPAIGN_ID, CURRENT_RELEASE.id, Date.now(), users.results.length, missing, excluded),
    ...recipients.map((r) =>
      env.DB.prepare(
        "INSERT INTO campaign_recipients(id,campaign_id,user_id,email,had_usage,had_setup) VALUES(?,?,?,?,?,?)",
      ).bind(crypto.randomUUID(), CAMPAIGN_ID, r.id, r.email, r.had_usage, r.had_setup),
    ),
  ]);
}

export async function campaignReports(env: Env): Promise<CampaignReport[]> {
  const rows =
    await env.DB.prepare(`SELECT c.id,c.status,c.created_at AS createdAt,c.started_at AS startedAt,
    c.audience_total AS audienceTotal,c.missing_email AS missingEmail,c.excluded,
    COUNT(r.id) AS recipients,
    COALESCE(SUM(r.status='pending'),0) AS pending,
    COALESCE(SUM(r.status='failed'),0) AS failed,
    COALESCE(SUM(r.status='cancelled'),0) AS cancelled,
    COUNT(r.sent_at) AS sent,COUNT(r.delivered_at) AS delivered,COUNT(r.opened_at) AS opened,
    COUNT(r.clicked_at) AS clicked,COUNT(r.returned_at) AS returned,
    COUNT(r.returned_after_click_at) AS returnedAfterClick,
    COALESCE(SUM(r.had_usage=0 AND r.sent_at IS NOT NULL),0) AS newUsageEligible,
    COALESCE(SUM(r.had_usage=0 AND r.usage_at IS NOT NULL),0) AS newUsage,
    COALESCE(SUM(r.had_usage=0 AND r.usage_at>=r.clicked_at),0) AS newUsageAfterClick,
    COALESCE(SUM(r.had_usage=1 AND r.usage_at IS NOT NULL),0) AS existingUsageActive,
    COALESCE(SUM(r.had_setup=0 AND r.sent_at IS NOT NULL),0) AS newSetupEligible,
    COALESCE(SUM(r.had_setup=0 AND r.setup_at IS NOT NULL),0) AS newSetup,
    COALESCE(SUM(r.had_setup=0 AND r.setup_at>=r.clicked_at),0) AS newSetupAfterClick,
    COUNT(r.bounced_at) AS bounced,COUNT(r.complained_at) AS complained,COUNT(r.unsubscribed_at) AS unsubscribed
    FROM release_campaigns c LEFT JOIN campaign_recipients r ON r.campaign_id=c.id
    GROUP BY c.id ORDER BY c.created_at DESC`).all<CampaignReport>();
  return rows.results;
}

/** Server-confirmed activity; never count copying a command as an installation. */
export async function recordCampaignActivity(
  env: Env,
  userId: string,
  kind: "returned" | "usage" | "setup",
) {
  const column = { returned: "returned_at", usage: "usage_at", setup: "setup_at" }[kind];
  const now = Date.now();
  if (kind === "returned") {
    await env.DB.prepare(`UPDATE campaign_recipients SET returned_after_click_at=COALESCE(returned_after_click_at,?)
      WHERE user_id=? AND sent_at IS NOT NULL AND clicked_at<=? AND sent_at>=? AND returned_after_click_at IS NULL`)
      .bind(now, userId, now, now - 30 * DAY)
      .run();
  }
  await env.DB.prepare(`UPDATE campaign_recipients SET ${column}=COALESCE(${column},?)
    WHERE user_id=? AND sent_at IS NOT NULL AND sent_at<=? AND sent_at>=? AND ${column} IS NULL`)
    .bind(now, userId, now, now - 30 * DAY)
    .run();
}

export async function deliverReleaseEmails(env: Env, apiOrigin = "https://api.tokenrats.com") {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM || !env.RESEND_WEBHOOK_SECRET)
    return { sent: 0, configured: false };
  const now = Date.now();
  const rows = await env.DB.prepare(`SELECT r.* FROM campaign_recipients r
    JOIN release_campaigns c ON c.id=r.campaign_id
    WHERE c.status='sending' AND r.status='pending' AND r.next_attempt_at<=? ORDER BY r.id LIMIT 10`)
    .bind(now)
    .all<{
      id: string;
      campaign_id: string;
      user_id: string;
      email: string;
      attempts: number;
      first_attempt_at: number | null;
    }>();
  let sent = 0;
  for (const row of rows.results) {
    const allowed =
      await env.DB.prepare(`SELECT 1 FROM users u LEFT JOIN release_email_preferences p ON p.user_id=u.id
      WHERE u.id=? AND COALESCE(p.enabled,1)=1 AND LOWER(TRIM(u.email))=?
      AND NOT EXISTS(SELECT 1 FROM email_suppressions e WHERE e.email=?)`)
        .bind(row.user_id, row.email, row.email)
        .first();
    if (!allowed) {
      await env.DB.prepare(
        "UPDATE campaign_recipients SET status='cancelled' WHERE id=? AND status='pending'",
      )
        .bind(row.id)
        .run();
      continue;
    }
    // Resend retains idempotency keys for 24 hours. Never retry an ambiguous send after that.
    if (
      row.attempts >= 5 ||
      (row.first_attempt_at !== null && now - row.first_attempt_at >= 23 * 60 * 60 * 1000)
    ) {
      await env.DB.prepare(
        "UPDATE campaign_recipients SET status='failed',error='Delivery requires review' WHERE id=? AND status='pending'",
      )
        .bind(row.id)
        .run();
      continue;
    }
    const lease = await env.DB.prepare(`UPDATE campaign_recipients SET attempts=attempts+1,
      first_attempt_at=COALESCE(first_attempt_at,?),next_attempt_at=?
      WHERE id=? AND status='pending' AND next_attempt_at<=?
      AND EXISTS(SELECT 1 FROM release_campaigns WHERE id=campaign_id AND status='sending')`)
      .bind(now, now + 300_000, row.id, now)
      .run();
    if (!lease.meta.changes) continue;
    const result = await sendEmail(env, {
      ...releaseEmail(env.WEB_ORIGIN, apiOrigin, row.id),
      to: row.email,
      key: `release-${row.id}`,
      tags: [
        { name: "campaign", value: row.campaign_id },
        { name: "recipient", value: row.id },
      ],
    });
    if (result.ok) {
      sent++;
      await env.DB.prepare(
        "UPDATE campaign_recipients SET status=CASE WHEN status='pending' THEN 'sent' ELSE status END,sent_at=COALESCE(sent_at,?),provider_id=? WHERE id=?",
      )
        .bind(Date.now(), result.id ?? null, row.id)
        .run();
    } else {
      await env.DB.prepare(
        "UPDATE campaign_recipients SET next_attempt_at=?,error='Provider did not confirm delivery' WHERE id=?",
      )
        .bind(now + Math.min(3_600_000, 300_000 * 2 ** row.attempts), row.id)
        .run();
    }
    // Shared provider limit is two requests/second. Keep batches gentle.
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  await env.DB.prepare(`UPDATE release_campaigns SET status='complete' WHERE status='sending'
    AND NOT EXISTS(SELECT 1 FROM campaign_recipients r WHERE r.campaign_id=release_campaigns.id AND r.status='pending')`).run();
  return { sent, configured: true };
}
