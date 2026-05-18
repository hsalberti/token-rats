/**
 * token-rats sync
 *
 * Discovers Claude Code .jsonl files + Cursor sqlite cache, parses them via
 * @token-rats/parsers, dedupes locally, then uploads in batches of 500 to
 * POST /v1/sessions.
 */

import * as fs from "node:fs";
import type { SessionRecord } from "@token-rats/contracts";
import { parseClaudeCode, parseCursor } from "@token-rats/parsers";
import { ApiClient, ApiError } from "../lib/api.js";
import { loadToken } from "../lib/auth-store.js";
import { readCursorDb } from "../lib/cursor-extract.js";
import { discoverClaudeCodeFiles, discoverCursorDb } from "../lib/discover.js";
import { dim, error, info, spinner, success, warn } from "../lib/log.js";

const BATCH_SIZE = 500;

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

export async function syncCommand(opts: SyncOptions): Promise<void> {
  const token = loadToken();
  if (!token && !opts.dryRun) {
    error("Not logged in. Run `token-rats login` first.");
    process.exit(1);
  }

  const client = opts.dryRun
    ? null
    : new ApiClient({ apiUrl: opts.apiUrl, token: token ?? undefined });

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

  // ── 2. Discover + parse Cursor ─────────────────────────────────────────────
  const cursorSessions: SessionRecord[] = [];
  const cursorDbPath = discoverCursorDb();

  if (cursorDbPath) {
    if (opts.verbose) info(`Found Cursor DB at ${cursorDbPath}`);
    const { rows, skipped } = await readCursorDb(cursorDbPath);
    if (skipped) {
      warn(skipped);
    } else if (rows.length > 0) {
      try {
        const records = parseCursor(JSON.stringify(rows));
        cursorSessions.push(...records);
        if (opts.verbose) dim(`  Cursor DB: ${records.length} session(s)`);
      } catch {
        if (opts.verbose) warn("Failed to parse Cursor rows — skipping");
      }
    } else if (opts.verbose) {
      dim("  Cursor DB: 0 rows found");
    }
  } else {
    if (opts.verbose) info("Cursor DB not found — skipping Cursor source");
  }

  // ── 3. Dedupe locally by dedupeKey ─────────────────────────────────────────
  const seen = new Set<string>();
  const allSessions: SessionRecord[] = [];
  for (const s of [...claudeSessions, ...cursorSessions]) {
    if (!seen.has(s.dedupeKey)) {
      seen.add(s.dedupeKey);
      allSessions.push(s);
    }
  }

  const sources: string[] = [];
  if (claudeSessions.length > 0) sources.push("Claude Code");
  if (cursorSessions.length > 0) sources.push("Cursor");
  const sourceStr = sources.length > 0 ? sources.join(" + ") : "no sources";

  if (allSessions.length === 0) {
    info(`No sessions found from ${sourceStr}.`);
    return;
  }

  info(`Discovered ${allSessions.length} session(s) from ${sourceStr}.`);

  // ── 4. Dry-run short-circuit ───────────────────────────────────────────────
  if (opts.dryRun) {
    info(`[dry-run] Would upload ${allSessions.length} session(s) in ${Math.ceil(allSessions.length / BATCH_SIZE)} batch(es).`);
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
}
