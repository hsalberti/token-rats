/**
 * Weekly digest builder for Token Rats.
 *
 * buildWeeklyDigest(userId, db, opts) aggregates the past 7 days from
 * daily_rollup and returns { subject, html, text } ready to send via email.
 *
 * Unsubscribe tokens are HMAC-signed with the same SESSION_SIGNING_KEY the
 * auth layer uses — we just sign a different payload (purpose-prefixed) so a
 * leaked unsubscribe link can never be replayed as a session cookie.
 */

import { WEEK_MS } from "./time.js";

export interface DigestResult {
  subject: string;
  html: string;
  text: string;
}

interface DigestOpts {
  /** Web origin for the unsubscribe link, e.g. `https://tokenrats.com`. */
  webOrigin: string;
  /** Signing key (same as `SESSION_SIGNING_KEY`). */
  signingKey: string;
}

interface DailyRollupRow {
  day: string;
  tokens: number;
  cost_usd_cents: number;
  sessions: number;
}

interface UserRow {
  handle: string;
}

interface WeeklyStats {
  totalTokens: number;
  totalCostCents: number;
  totalSessions: number;
  bestDay: string | null;
  bestDayTokens: number;
  rows: DailyRollupRow[];
}

const ALG = { name: "HMAC", hash: "SHA-256" };
const UNSUBSCRIBE_PURPOSE = "unsub";

function b64urlEncode(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - (padded.length % 4)) % 4;
  const bin = atob(padded + "=".repeat(pad));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function importKey(raw: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(raw), ALG, false, [
    "sign",
    "verify",
  ]);
}

/**
 * Sign an unsubscribe token. Format: `<userId>.<issuedAt>.<sig>`.
 * The payload that's signed is purpose-prefixed (`unsub:<userId>.<issuedAt>`) so
 * this token cannot be replayed as a session cookie.
 */
export async function signUnsubscribeToken(userId: string, signingKey: string): Promise<string> {
  const issuedAt = Date.now();
  const payload = `${UNSUBSCRIBE_PURPOSE}:${userId}.${issuedAt}`;
  const key = await importKey(signingKey);
  const sig = await crypto.subtle.sign(ALG, key, new TextEncoder().encode(payload));
  return `${userId}.${issuedAt}.${b64urlEncode(sig)}`;
}

export type VerifyUnsubResult = { ok: true; userId: string } | { ok: false; reason: string };

/**
 * Verify an unsubscribe token. No expiry — once a user clicks "unsubscribe", the
 * link should keep working even if they find it months later in their archive.
 */
export async function verifyUnsubscribeToken(
  token: string,
  signingKey: string,
): Promise<VerifyUnsubResult> {
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  const [userId, issuedAtStr, sigB64] = parts as [string, string, string];
  if (!userId || !Number.isFinite(Number(issuedAtStr))) {
    return { ok: false, reason: "malformed" };
  }
  const payload = `${UNSUBSCRIBE_PURPOSE}:${userId}.${issuedAtStr}`;
  const key = await importKey(signingKey);
  const valid = await crypto.subtle.verify(
    ALG,
    key,
    b64urlDecode(sigB64),
    new TextEncoder().encode(payload),
  );
  if (!valid) return { ok: false, reason: "bad_signature" };
  return { ok: true, userId };
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDay(day: string): string {
  // day is YYYY-MM-DD
  const d = new Date(`${day}T00:00:00Z`);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function buildStats(rows: DailyRollupRow[]): WeeklyStats {
  let totalTokens = 0;
  let totalCostCents = 0;
  let totalSessions = 0;
  let bestDay: string | null = null;
  let bestDayTokens = 0;

  for (const row of rows) {
    totalTokens += row.tokens;
    totalCostCents += row.cost_usd_cents;
    totalSessions += row.sessions;
    if (row.tokens > bestDayTokens) {
      bestDayTokens = row.tokens;
      bestDay = row.day;
    }
  }

  return { totalTokens, totalCostCents, totalSessions, bestDay, bestDayTokens, rows };
}

function buildHtml(
  handle: string,
  stats: WeeklyStats,
  unsubscribeUrl: string,
  webOrigin: string,
): string {
  const rowsHtml = stats.rows
    .map(
      (r) => `
    <tr>
      <td style="padding:4px 8px;color:#a1a1aa">${formatDay(r.day)}</td>
      <td style="padding:4px 8px;text-align:right">${formatTokens(r.tokens)}</td>
      <td style="padding:4px 8px;text-align:right">${formatCents(r.cost_usd_cents)}</td>
      <td style="padding:4px 8px;text-align:right">${r.sessions}</td>
    </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Token Rats Weekly Digest</title></head>
<body style="background:#09090b;color:#f4f4f5;font-family:system-ui,sans-serif;margin:0;padding:32px">
  <div style="max-width:520px;margin:0 auto">
    <h1 style="font-size:24px;margin:0 0 4px">Token Rats Weekly</h1>
    <p style="color:#a1a1aa;margin:0 0 24px">Hey @${handle}, here's your week in tokens.</p>

    <table style="width:100%;border-collapse:separate;border-spacing:8px 0;margin:0 -8px 24px">
      <tr>
        <td style="background:#18181b;border-radius:8px;padding:16px;width:33%">
          <div style="font-size:12px;color:#a1a1aa;text-transform:uppercase;letter-spacing:.05em">Total tokens</div>
          <div style="font-size:28px;font-weight:700;margin-top:4px">${formatTokens(stats.totalTokens)}</div>
        </td>
        <td style="background:#18181b;border-radius:8px;padding:16px;width:33%">
          <div style="font-size:12px;color:#a1a1aa;text-transform:uppercase;letter-spacing:.05em">Cost burned</div>
          <div style="font-size:28px;font-weight:700;margin-top:4px">${formatCents(stats.totalCostCents)}</div>
        </td>
        <td style="background:#18181b;border-radius:8px;padding:16px;width:33%">
          <div style="font-size:12px;color:#a1a1aa;text-transform:uppercase;letter-spacing:.05em">Sessions</div>
          <div style="font-size:28px;font-weight:700;margin-top:4px">${stats.totalSessions}</div>
        </td>
      </tr>
    </table>

    ${
      stats.bestDay
        ? `<p style="color:#a1a1aa;margin:0 0 16px">Best day: <strong style="color:#f97316">${formatDay(stats.bestDay)}</strong> with ${formatTokens(stats.bestDayTokens)} tokens.</p>`
        : ""
    }

    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
      <thead>
        <tr style="font-size:12px;color:#a1a1aa;text-transform:uppercase;letter-spacing:.05em">
          <th style="padding:4px 8px;text-align:left">Day</th>
          <th style="padding:4px 8px;text-align:right">Tokens</th>
          <th style="padding:4px 8px;text-align:right">Cost</th>
          <th style="padding:4px 8px;text-align:right">Sessions</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>

    <p style="font-size:12px;color:#52525b;margin-top:24px">
      You're receiving this because you have weekly digests enabled.
      <a href="${webOrigin}/settings/notifications" style="color:#f97316">Manage preferences</a>
      &nbsp;·&nbsp;
      <a href="${unsubscribeUrl}" style="color:#f97316">Unsubscribe</a>
    </p>
  </div>
</body>
</html>`;
}

function buildText(
  handle: string,
  stats: WeeklyStats,
  unsubscribeUrl: string,
  webOrigin: string,
): string {
  const lines = [
    `Token Rats Weekly — @${handle}`,
    "",
    `Total tokens: ${formatTokens(stats.totalTokens)}`,
    `Cost burned:  ${formatCents(stats.totalCostCents)}`,
    `Sessions:     ${stats.totalSessions}`,
    "",
  ];

  if (stats.bestDay) {
    lines.push(
      `Best day: ${formatDay(stats.bestDay)} (${formatTokens(stats.bestDayTokens)} tokens)`,
      "",
    );
  }

  lines.push("Daily breakdown:", "");
  for (const r of stats.rows) {
    lines.push(
      `  ${formatDay(r.day)}: ${formatTokens(r.tokens)} tokens / ${formatCents(r.cost_usd_cents)} / ${r.sessions} sessions`,
    );
  }

  lines.push(
    "",
    `Manage preferences: ${webOrigin}/settings/notifications`,
    `Unsubscribe: ${unsubscribeUrl}`,
  );

  return lines.join("\n");
}

/**
 * Build the weekly digest email for a user.
 *
 * Queries daily_rollup for the past 7 UTC days.
 * Returns { subject, html, text } — does NOT send.
 *
 * Returns null if the user has no data in the window.
 */
export async function buildWeeklyDigest(
  userId: string,
  db: D1Database,
  opts: DigestOpts,
): Promise<DigestResult | null> {
  // Get user handle
  const userRow = await db
    .prepare("SELECT handle FROM users WHERE id = ?")
    .bind(userId)
    .first<UserRow>();

  if (!userRow) return null;

  // Compute the 7-day window (UTC days)
  const now = new Date();
  const endDay = now.toISOString().slice(0, 10);
  const startDate = new Date(now.getTime() - WEEK_MS);
  const startDay = startDate.toISOString().slice(0, 10);

  const result = await db
    .prepare(
      `SELECT day, tokens, cost_usd_cents, sessions
       FROM daily_rollup
       WHERE user_id = ? AND day >= ? AND day <= ?
       ORDER BY day ASC`,
    )
    .bind(userId, startDay, endDay)
    .all<DailyRollupRow>();

  const rows = result.results ?? [];
  if (rows.length === 0) return null;

  const stats = buildStats(rows);
  const subject = `Your Token Rats week: ${formatTokens(stats.totalTokens)} tokens burned`;

  const token = await signUnsubscribeToken(userId, opts.signingKey);
  const unsubscribeUrl = `${opts.webOrigin}/unsubscribe?token=${encodeURIComponent(token)}`;

  return {
    subject,
    html: buildHtml(userRow.handle, stats, unsubscribeUrl, opts.webOrigin),
    text: buildText(userRow.handle, stats, unsubscribeUrl, opts.webOrigin),
  };
}
