/**
 * token-rats watch
 *
 * Long-running daemon mode. Watches the Claude Code logs directory for new
 * lines / file changes, parses them with `parseClaudeCode`, dedupes against an
 * in-memory Set, and immediately posts any NEW SessionRecords to POST /v1/sessions.
 *
 * Also:
 *   - Sends a heartbeat to POST /v1/me/devices/heartbeat every 60s so the
 *     web UI's "live" indicator flips green within a minute of startup.
 *   - Persists per-file watch state (`{ path, size, mtime }`) to
 *     `~/.config/token-rats/watch-state.json` so a restart doesn't re-scan
 *     from scratch, and detects log rotation when a file's size shrinks.
 *   - Refuses to run if the device was disconnected from the web UI (the
 *     CLI clears the sentinel via `token-rats install-daemon` after re-login).
 *
 * Flags:
 *   --api-url <url>     Override API base URL
 *   --verbose           Print per-file and per-session detail
 *   --interval <ms>     Debounce window in ms (default: 2000)
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { SessionRecord } from "@token-rats/contracts";
import { parseClaudeCode } from "@token-rats/parsers";
import { ApiClient, ApiError, DeviceRevokedError } from "../lib/api.js";
import {
  deleteToken,
  ensureDeviceId,
  isDisconnected,
  loadToken,
  markDisconnected,
} from "../lib/auth-store.js";
import { CLI_VERSION } from "../lib/cli-version.js";
import { claudeCodeProjectsDir } from "../lib/discover.js";
import { dim, error, info, success, warn } from "../lib/log.js";

export interface WatchOptions {
  apiUrl?: string;
  verbose?: boolean;
  /** Debounce window in milliseconds. Default: 2000. */
  interval?: number;
}

const HEARTBEAT_MS = 60_000;

// ── Dedupe + state ────────────────────────────────────────────────────────────

const seen = new Set<string>();

interface FileState {
  size: number;
  mtimeMs: number;
}

function stateFilePath(): string {
  const xdgConfig = process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config");
  return path.join(xdgConfig, "token-rats", "watch-state.json");
}

function loadWatchState(): Record<string, FileState> {
  try {
    const raw = fs.readFileSync(stateFilePath(), "utf8");
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function saveWatchState(state: Record<string, FileState>): void {
  try {
    const file = stateFilePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(state), { mode: 0o600 });
  } catch (err) {
    // Persisting state is best-effort.
    if (err instanceof Error) {
      // eslint-disable-next-line no-console
      console.warn(`watch-state write failed: ${err.message}`);
    }
  }
}

function statFile(p: string): FileState | null {
  try {
    const s = fs.statSync(p);
    return { size: s.size, mtimeMs: s.mtimeMs };
  } catch {
    return null;
  }
}

function parseAndFilter(filePath: string, verbose: boolean): SessionRecord[] {
  let text: string;
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch {
    if (verbose) warn(`Could not read ${filePath} — skipping`);
    return [];
  }

  let records: SessionRecord[];
  try {
    records = parseClaudeCode(text);
  } catch {
    if (verbose) warn(`Failed to parse ${filePath} — skipping`);
    return [];
  }

  const fresh: SessionRecord[] = [];
  for (const r of records) {
    if (!seen.has(r.dedupeKey)) {
      seen.add(r.dedupeKey);
      fresh.push(r);
    }
  }

  if (verbose && fresh.length > 0) {
    dim(`  ${filePath}: ${fresh.length} new session(s)`);
  }
  return fresh;
}

// ── Upload helper ─────────────────────────────────────────────────────────────

async function upload(
  client: ApiClient,
  records: SessionRecord[],
  verbose: boolean,
): Promise<void> {
  if (records.length === 0) return;
  try {
    const res = await client.uploadSessions(records);
    if (verbose) {
      dim(`  Uploaded ${res.accepted} new, ${res.duplicates} duplicate(s)`);
    } else {
      success(`Uploaded ${res.accepted} session(s)`);
    }
  } catch (err) {
    if (err instanceof DeviceRevokedError) {
      markDisconnected();
      deleteToken();
      error(
        "This device was disconnected from the Token Rats web UI. Daemon will exit; re-run `token-rats login` to reconnect.",
      );
      process.exit(0);
    }
    if (err instanceof ApiError && err.status === 401) {
      error("Session expired. Run `token-rats login` to re-authenticate.");
      process.exit(1);
    }
    warn(`Upload failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── Debounce helper ───────────────────────────────────────────────────────────

function makeDebounced(fn: (path: string) => void, ms: number): (path: string) => void {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  return (path: string) => {
    const existing = timers.get(path);
    if (existing) clearTimeout(existing);
    timers.set(
      path,
      setTimeout(() => {
        timers.delete(path);
        fn(path);
      }, ms),
    );
  };
}

// ── Initial snapshot ──────────────────────────────────────────────────────────

function findJsonlFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      results.push(...findJsonlFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      results.push(full);
    }
  }
  return results;
}

// ── Main command ──────────────────────────────────────────────────────────────

export async function watchCommand(opts: WatchOptions): Promise<void> {
  if (isDisconnected()) {
    error(
      "This device was disconnected from the Token Rats web UI. Run `token-rats login` to reconnect.",
    );
    process.exit(0);
  }

  const token = loadToken();
  if (!token) {
    error("Not logged in. Run `token-rats login` first.");
    process.exit(1);
  }

  const client = new ApiClient({
    apiUrl: opts.apiUrl,
    token,
    deviceId: ensureDeviceId(),
    cliVersion: CLI_VERSION,
  });
  const debounceMs = opts.interval ?? 2000;
  const dir = claudeCodeProjectsDir();

  if (!fs.existsSync(dir)) {
    warn(`Claude Code projects directory not found: ${dir}`);
    warn("No files to watch. Exiting.");
    process.exit(0);
  }

  info(`Watching ${dir} (debounce: ${debounceMs}ms)`);
  info("Press Ctrl-C to stop.\n");

  // Persisted per-file state — used to detect log rotation (size shrinks).
  const persistedState = loadWatchState();
  const liveState = new Map<string, FileState>();

  const initialFiles = findJsonlFiles(dir);
  for (const f of initialFiles) {
    const cur = statFile(f);
    if (!cur) continue;
    liveState.set(f, cur);
    const prev = persistedState[f];
    if (prev && cur.size < prev.size) {
      warn(`Rotation detected on ${f}: size shrank ${prev.size} → ${cur.size}.`);
    }
    parseAndFilter(f, false); // seed `seen` without uploading
  }
  if (opts.verbose) {
    dim(`Initial snapshot: ${seen.size} session(s) in ${initialFiles.length} file(s)`);
  }

  // Persist a baseline immediately so a quick restart doesn't lose state.
  saveWatchState(Object.fromEntries(liveState));

  const onChanged = makeDebounced(async (filePath: string) => {
    if (!filePath.endsWith(".jsonl")) return;
    const cur = statFile(filePath);
    if (cur) {
      const prev = liveState.get(filePath);
      if (prev && cur.size < prev.size) {
        warn(`Rotation detected on ${filePath}: size shrank ${prev.size} → ${cur.size}.`);
      }
      liveState.set(filePath, cur);
      saveWatchState(Object.fromEntries(liveState));
    }
    const fresh = parseAndFilter(filePath, opts.verbose ?? false);
    if (fresh.length > 0) {
      await upload(client, fresh, opts.verbose ?? false);
    }
  }, debounceMs);

  // ── Heartbeat ──────────────────────────────────────────────────────────────
  const heartbeatTimer = setInterval(async () => {
    try {
      await client.heartbeat();
    } catch (err) {
      if (err instanceof DeviceRevokedError) {
        markDisconnected();
        deleteToken();
        error(
          "This device was disconnected from the Token Rats web UI. Daemon exiting; re-run `token-rats login` to reconnect.",
        );
        cleanup?.();
        clearInterval(heartbeatTimer);
        process.exit(0);
      }
      // Other heartbeat failures are non-fatal — log + retry next tick.
      if (opts.verbose) {
        dim(`Heartbeat failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }, HEARTBEAT_MS);

  // Fire one heartbeat immediately so the device shows live within seconds of
  // the first session upload (which creates the devices row).
  client.heartbeat().catch(() => {
    /* ignore — first heartbeat may race the first sessions upload that
     * creates the devices row; subsequent heartbeats will succeed. */
  });

  // ── File watcher ──────────────────────────────────────────────────────────
  let cleanup: (() => void) | null = null;

  try {
    const chokidar = await (
      new Function("m", "return import(m)") as (m: string) => Promise<{
        watch: (
          pattern: string,
          opts: Record<string, unknown>,
        ) => {
          on: (event: string, fn: (p: string) => void) => void;
          close: () => void;
        };
      }>
    )("chokidar");
    const watcher = chokidar.watch(`${dir}/**/*.jsonl`, {
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
    });
    watcher.on("add", (p: string) => onChanged(p));
    watcher.on("change", (p: string) => onChanged(p));
    cleanup = () => watcher.close();
    if (opts.verbose) dim("Using chokidar for file watching");
  } catch {
    if (opts.verbose) dim("chokidar not available; using Node built-in fs.watch");

    if (process.platform === "linux") {
      let lastMtimes = new Map<string, number>();
      for (const f of initialFiles) {
        try {
          lastMtimes.set(f, fs.statSync(f).mtimeMs);
        } catch {
          // ignore
        }
      }
      const pollInterval = setInterval(() => {
        const current = findJsonlFiles(dir);
        for (const f of current) {
          try {
            const mtime = fs.statSync(f).mtimeMs;
            const prev = lastMtimes.get(f) ?? 0;
            if (mtime > prev) {
              lastMtimes.set(f, mtime);
              onChanged(f);
            }
          } catch {
            // ignore
          }
        }
        for (const f of current) {
          if (!lastMtimes.has(f)) {
            lastMtimes.set(f, Date.now());
            onChanged(f);
          }
        }
        lastMtimes = new Map(current.map((f) => [f, lastMtimes.get(f) ?? 0]));
      }, debounceMs);
      cleanup = () => clearInterval(pollInterval);
    } else {
      const controller = new AbortController();
      (async () => {
        try {
          const { watch } = await import("node:fs/promises");
          const watcher = watch(dir, { recursive: true, signal: controller.signal });
          for await (const event of watcher) {
            const filename = event.filename;
            if (filename?.endsWith(".jsonl")) {
              const fullPath = `${dir}/${filename}`;
              onChanged(fullPath);
            }
          }
        } catch (err) {
          if (err instanceof Error && err.name !== "AbortError") {
            warn(`Watcher error: ${err.message}`);
          }
        }
      })();
      cleanup = () => controller.abort();
    }
  }

  function shutdown() {
    info("Shutting down…");
    clearInterval(heartbeatTimer);
    if (cleanup) cleanup();
    process.exit(0);
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
