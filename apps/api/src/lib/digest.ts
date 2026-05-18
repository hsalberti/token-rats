/**
 * Weekly digest builder for Token Rats.
 *
 * buildWeeklyDigest(userId, db) aggregates the past 7 days from daily_rollup
 * and returns { subject, html, text } ready to send via email.
 *
 * This is a pure(-ish) function — no external calls, just DB reads.
 */

import { WEEK_MS } from "./time.js";

export interface DigestResult {
  subject: string;
  html: string;
  text: string;
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
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
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

function buildHtml(handle: string, stats: WeeklyStats): string {
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

    <div style="display:flex;gap:16px;margin-bottom:24px">
      <div style="flex:1;background:#18181b;border-radius:8px;padding:16px">
        <div style="font-size:12px;color:#a1a1aa;text-transform:uppercase;letter-spacing:.05em">Total tokens</div>
        <div style="font-size:28px;font-weight:700;margin-top:4px">${formatTokens(stats.totalTokens)}</div>
      </div>
      <div style="flex:1;background:#18181b;border-radius:8px;padding:16px">
        <div style="font-size:12px;color:#a1a1aa;text-transform:uppercase;letter-spacing:.05em">Cost burned</div>
        <div style="font-size:28px;font-weight:700;margin-top:4px">${formatCents(stats.totalCostCents)}</div>
      </div>
      <div style="flex:1;background:#18181b;border-radius:8px;padding:16px">
        <div style="font-size:12px;color:#a1a1aa;text-transform:uppercase;letter-spacing:.05em">Sessions</div>
        <div style="font-size:28px;font-weight:700;margin-top:4px">${stats.totalSessions}</div>
      </div>
    </div>

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

    <p style="font-size:12px;color:#52525b">
      You're receiving this because you have weekly digests enabled.
      <a href="https://tokenrats.com/settings/notifications" style="color:#f97316">Manage preferences</a>
    </p>
  </div>
</body>
</html>`;
}

function buildText(handle: string, stats: WeeklyStats): string {
  const lines = [
    `Token Rats Weekly — @${handle}`,
    "",
    `Total tokens: ${formatTokens(stats.totalTokens)}`,
    `Cost burned:  ${formatCents(stats.totalCostCents)}`,
    `Sessions:     ${stats.totalSessions}`,
    "",
  ];

  if (stats.bestDay) {
    lines.push(`Best day: ${formatDay(stats.bestDay)} (${formatTokens(stats.bestDayTokens)} tokens)`, "");
  }

  lines.push("Daily breakdown:", "");
  for (const r of stats.rows) {
    lines.push(`  ${formatDay(r.day)}: ${formatTokens(r.tokens)} tokens / ${formatCents(r.cost_usd_cents)} / ${r.sessions} sessions`);
  }

  lines.push("", "Manage preferences: https://tokenrats.com/settings/notifications");

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

  return {
    subject,
    html: buildHtml(userRow.handle, stats),
    text: buildText(userRow.handle, stats),
  };
}
