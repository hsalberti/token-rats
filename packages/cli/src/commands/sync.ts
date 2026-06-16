/**
 * token-rats sync
 *
 * Discovers Claude Code .jsonl files + Cursor sqlite cache, parses them via
 * @token-rats/parsers, dedupes locally, then uploads in batches of 500 to
 * POST /v1/sessions.
 */

import * as fs from "node:fs";
import type { SessionRecord } from "@token-rats/contracts";
import { computeDedupeKey, parseClaudeCode, parseCodex, parseCursor } from "@token-rats/parsers";
import { ApiClient, ApiError, DeviceRevokedError } from "../lib/api.js";
import { deleteToken, ensureDeviceId, loadToken, markDisconnected } from "../lib/auth-store.js";
import { CLI_VERSION } from "../lib/cli-version.js";
import { extractCursorGenerations } from "../lib/cursor-extract.js";
import { discoverClaudeCodeFiles, discoverCodexFiles } from "../lib/discover.js";
import { bold, c, dim, error, info, spinner, success, warn } from "../lib/log.js";

const BATCH_SIZE = 150;

const WEB_ORIGIN = "https://tokenrats.com";

/** Compute the trailing current streak (consecutive UTC days ending today or
 *  yesterday) from a list of YYYY-MM-DD days that had ≥1 session. Mirrors the
 *  server's room-streak definition in apps/api/src/routes/streaks.ts. */
function currentStreakFromDays(days: string[], todayUtc: string): number {
  const active = days.slice().sort();
  if (active.length === 0) return 0;
  const last = active[active.length - 1]!;
  const yesterday = (() => {
    const d = new Date(`${todayUtc}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  })();
  if (last !== todayUtc && last !== yesterday) return 0;
  let streak = 1;
  for (let i = active.length - 1; i >= 1; i--) {
    const prev = new Date(`${active[i - 1]}T00:00:00Z`).getTime();
    const curr = new Date(`${active[i]}T00:00:00Z`).getTime();
    if (Math.round((curr - prev) / 86_400_000) === 1) streak++;
    else break;
  }
  return streak;
}

/**
 * Post-sync "hero moment": fetch the user's global rank, current streak and
 * profile URL, then print them with a ready-to-paste "Post to X" line.
 *
 * Every fetch is best-effort — any network or parse failure is swallowed so a
 * flaky connection never turns a successful sync into a crash.
 */
async function printSyncHero(client: ApiClient): Promise<void> {
  let handle: string;
  try {
    const me = await client.getMe();
    handle = me.user.handle;
  } catch {
    return; // can't identify the user — skip the hero block entirely
  }

  const todayUtc = new Date().toISOString().slice(0, 10);

  const [trending, heatmap] = await Promise.all([
    client.getTrending("30d").catch(() => null),
    client.getHeatmap(handle).catch(() => null),
  ]);

  const rank = trending?.rows.find((r) => r.handle === handle)?.rank ?? null;
  const streak =
    heatmap === null
      ? 0
      : currentStreakFromDays(
          heatmap.heatmap.days.filter((d) => d.sessions > 0).map((d) => d.day),
          todayUtc,
        );

  const profileUrl = `${WEB_ORIGIN}/u/${handle}`;

  console.log("");
  bold("🐀 Your Token Rats standing");
  if (rank !== null) info(`Global rank: #${rank}`);
  if (streak > 0) info(`Current streak: ${streak} day${streak === 1 ? "" : "s"} 🔥`);
  info(`Profile: ${profileUrl}`);

  const rankPart = rank !== null ? `ranked #${rank} globally` : "on the board";
  const streakPart = streak > 0 ? ` on a ${streak}-day streak` : "";
  const tweet = `I'm ${rankPart}${streakPart} on @tokenrats — tracking my AI coding tokens. 🐀`;
  const intent = `https://x.com/intent/tweet?text=${encodeURIComponent(tweet)}&url=${encodeURIComponent(profileUrl)}`;

  console.log("");
  dim("Brag about it — Post to X:");
  console.log(`  ${process.stdout.isTTY ? `${c.cyan}${intent}${c.reset}` : intent}`);
}

export interface SyncOptions {
  apiUrl?: string;
  dryRun?: boolean;
  verbose?: boolean;
}

/** Chunk an array into sub-arrays of at most `size` elements. */
function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Fold any SessionRecords that share the same `id` into one — summing tokens,
 * taking the earliest startedAt / latest endedAt, and the model from whichever
 * record ended last. `dedupeKey` is recomputed from the merged totals; cost is
 * left at 0 (server is authoritative — see apps/api/src/lib/pricing.ts).
 */
function mergeBySessionId(records: SessionRecord[]): SessionRecord[] {
  const byId = new Map<string, SessionRecord>();
  for (const r of records) {
    const existing = byId.get(r.id);
    if (!existing) {
      byId.set(r.id, { ...r });
      continue;
    }
    existing.inTokens += r.inTokens;
    existing.outTokens += r.outTokens;
    if (r.startedAt < existing.startedAt) existing.startedAt = r.startedAt;
    if (r.endedAt > existing.endedAt) {
      existing.endedAt = r.endedAt;
      existing.model = r.model;
    }
  }
  for (const rec of byId.values()) {
    rec.costUsdCents = 0;
    rec.dedupeKey = computeDedupeKey(
      rec.source,
      rec.model,
      rec.startedAt,
      rec.inTokens,
      rec.outTokens,
    );
  }
  return Array.from(byId.values());
}

export async function syncCommand(opts: SyncOptions): Promise<void> {
  const token = loadToken();
  if (!token && !opts.dryRun) {
    error("Not logged in. Run `token-rats login` first.");
    process.exit(1);
  }

  const client = opts.dryRun
    ? null
    : new ApiClient({
        apiUrl: opts.apiUrl,
        token: token ?? undefined,
        deviceId: ensureDeviceId(),
        cliVersion: CLI_VERSION,
      });

  // ── 1. Discover + parse Claude Code files ──────────────────────────────────
  const claudeFiles = discoverClaudeCodeFiles();
  if (opts.verbose) {
    info(`Found ${claudeFiles.length} Claude Code file(s) in ~/.claude/projects/`);
    for (const f of claudeFiles) dim(`  ${f}`);
  }

  const claudeSessions: SessionRecord[] = [];
  for (const file of claudeFiles) {
    let text: string;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      if (opts.verbose) warn(`Could not read ${file} — skipping`);
      continue;
    }

    try {
      const records = parseClaudeCode(text);
      claudeSessions.push(...records);
      if (opts.verbose) dim(`  ${file}: ${records.length} session(s)`);
    } catch {
      if (opts.verbose) warn(`Failed to parse ${file} — skipping`);
    }
  }

  // ── 1b. Discover + parse Codex rollouts ────────────────────────────────────
  const codexFiles = discoverCodexFiles();
  if (opts.verbose) {
    info(`Found ${codexFiles.length} Codex rollout file(s)`);
    for (const f of codexFiles) dim(`  ${f}`);
  }

  const codexSessions: SessionRecord[] = [];
  for (const file of codexFiles) {
    let text: string;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      if (opts.verbose) warn(`Could not read ${file} — skipping`);
      continue;
    }
    try {
      const records = parseCodex(text);
      codexSessions.push(...records);
      if (opts.verbose) dim(`  ${file}: ${records.length} session(s)`);
    } catch {
      if (opts.verbose) warn(`Failed to parse ${file} — skipping`);
    }
  }

  // ── 2. Discover + parse Cursor ─────────────────────────────────────────────
  // Cursor's AI events live in `aiService.generations` inside per-workspace
  // state.vscdb files. Cursor does NOT store token counts on disk; the parser
  // estimates them from request type (see packages/parsers/src/cursor.ts).
  const cursorSessions: SessionRecord[] = [];
  const { rows, skipped, dbCount } = await extractCursorGenerations();

  if (skipped) {
    warn(skipped);
  } else if (dbCount === 0) {
    if (opts.verbose) info("No Cursor workspace storage found — skipping Cursor source");
  } else if (rows.length > 0) {
    if (opts.verbose) info(`Scanned ${dbCount} Cursor workspace DB(s)`);
    try {
      const records = parseCursor(JSON.stringify(rows));
      cursorSessions.push(...records);
      if (opts.verbose) {
        dim(
          `  Cursor: ${rows.length} generation event(s) → ${records.length} session(s) (tokens estimated, see help)`,
        );
      }
    } catch {
      if (opts.verbose) warn("Failed to parse Cursor rows — skipping");
    }
  } else if (opts.verbose) {
    dim(`  Scanned ${dbCount} Cursor workspace DB(s): no AI generations found`);
  }

  // ── 2.5. Merge Claude Code records that share the same sessionId ──────────
  // Claude Code splits one session across `<id>.jsonl` plus any number of
  // `<id>/subagents/*.jsonl` (one per Task subagent run). They all carry the
  // SAME `sessionId`, so our parser emits multiple SessionRecords with the
  // SAME `id`. The server's `INSERT OR IGNORE` on the `id` PK would keep
  // only the first and silently drop the rest — losing every subagent token.
  // Fold them here before dedupe/upload. Codex rollouts are one-per-file so
  // they don't need this step, but we run them through anyway in case Codex
  // ever introduces a similar split-file convention.
  const mergedClaude = mergeBySessionId(claudeSessions);
  if (opts.verbose && mergedClaude.length !== claudeSessions.length) {
    dim(
      `  Merged ${claudeSessions.length} Claude Code records into ${mergedClaude.length} sessions (subagent files folded into parents)`,
    );
  }
  const mergedCodex = mergeBySessionId(codexSessions);

  // ── 3. Dedupe locally by dedupeKey ─────────────────────────────────────────
  const seen = new Set<string>();
  const allSessions: SessionRecord[] = [];
  for (const s of [...mergedClaude, ...mergedCodex, ...cursorSessions]) {
    if (!seen.has(s.dedupeKey)) {
      seen.add(s.dedupeKey);
      allSessions.push(s);
    }
  }

  const sources: string[] = [];
  if (claudeSessions.length > 0) sources.push("Claude Code");
  if (codexSessions.length > 0) sources.push("Codex");
  if (cursorSessions.length > 0) sources.push("Cursor");
  const sourceStr = sources.length > 0 ? sources.join(" + ") : "no sources";

  if (allSessions.length === 0) {
    info(`No sessions found from ${sourceStr}.`);
    return;
  }

  info(`Discovered ${allSessions.length} session(s) from ${sourceStr}.`);

  // ── 4. Dry-run short-circuit ───────────────────────────────────────────────
  if (opts.dryRun) {
    info(
      `[dry-run] Would upload ${allSessions.length} session(s) in ${Math.ceil(allSessions.length / BATCH_SIZE)} batch(es).`,
    );
    if (opts.verbose) {
      for (const s of allSessions.slice(0, 10)) {
        dim(
          `  ${s.source}  ${s.model}  in:${s.inTokens} out:${s.outTokens}  dedupe:${s.dedupeKey}`,
        );
      }
      if (allSessions.length > 10) dim(`  … and ${allSessions.length - 10} more`);
    }
    return;
  }

  // ── 5. Upload in batches ───────────────────────────────────────────────────
  const batches = chunk(allSessions, BATCH_SIZE);
  const spin = spinner(`Uploading ${allSessions.length} session(s) in ${batches.length} batch(es)`);

  let totalAccepted = 0;
  let totalDuplicates = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]!;
    try {
      const res = await client!.uploadSessions(batch);
      totalAccepted += res.accepted;
      totalDuplicates += res.duplicates;
    } catch (err) {
      spin.stop();
      if (err instanceof DeviceRevokedError) {
        markDisconnected();
        deleteToken();
        error(
          "This device was disconnected from the Token Rats web UI. Run `token-rats login` to reconnect.",
        );
        process.exit(1);
      }
      if (err instanceof ApiError && err.status === 401) {
        error("Session expired. Run `token-rats login` to re-authenticate.");
        process.exit(1);
      }
      error(
        `Upload failed on batch ${i + 1}/${batches.length}: ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exit(1);
    }
  }

  spin.stop();

  success(
    `Synced ${allSessions.length} sessions (${totalAccepted} new, ${totalDuplicates} already on server) from ${sourceStr}`,
  );

  // Hero moment — best-effort, never blocks or fails the sync.
  try {
    await printSyncHero(client!);
  } catch {
    // ignore: the sync already succeeded
  }
}
