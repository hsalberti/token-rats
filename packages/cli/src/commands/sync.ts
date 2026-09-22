/**
 * token-rats sync
 *
 * Discovers Claude Code .jsonl files + Cursor sqlite cache, parses them via
 * @token-rats/parsers, dedupes locally, then uploads in batches of 500 to
 * POST /v1/sessions.
 */

import { ApiClient, ApiError, DeviceRevokedError } from "../lib/api.js";
import { deleteToken, ensureDeviceId, loadToken, markDisconnected } from "../lib/auth-store.js";
import { CLI_VERSION } from "../lib/cli-version.js";
import { collectSessions } from "../lib/collect.js";
import { bold, c, dim, error, info, spinner, success } from "../lib/log.js";

const BATCH_SIZE = 90;

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

  const allSessions = await collectSessions();
  const sourceStr =
    [...new Set(allSessions.map((record) => record.source))].join(" + ") || "no sources";

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
