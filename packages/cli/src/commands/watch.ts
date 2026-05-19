/**
 * token-rats watch
 *
 * Long-running daemon mode. Watches the Claude Code logs directory for new
 * lines / file changes, parses them with `parseClaudeCode`, dedupes against an
 * in-memory Set, and immediately posts any NEW SessionRecords to POST /v1/sessions.
 *
 * Uses chokidar when available (optional dep), falls back to Node's built-in
 * `fs/promises watch()`.
 *
 * Flags:
 *   --api-url <url>     Override API base URL
 *   --verbose           Print per-file and per-session detail
 *   --interval <ms>     Debounce window in ms (default: 2000)
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { SessionRecord, SourcePlan } from "@token-rats/contracts";
import { parseClaudeCode } from "@token-rats/parsers";
import { ApiClient, ApiError } from "../lib/api.js";
import { loadToken } from "../lib/auth-store.js";
import { claudeCodeProjectsDir } from "../lib/discover.js";
import { dim, error, info, success, warn } from "../lib/log.js";

/**
 * v1.2 Track AF — same detection used by `sync`. Defensive: missing $HOME
 * or unreadable files never throw, just return `'unknown'`.
 */
function detectClaudeCodePlan(): SourcePlan {
  try {
    const home = os.homedir();
    if (home) {
      const credPath = path.join(home, ".claude", ".credentials.json");
      if (fs.existsSync(credPath)) return "max";
    }
  } catch {
    // ignore
  }
  if (process.env["ANTHROPIC_API_KEY"]) return "api";
  return "unknown";
}

export interface WatchOptions {
  apiUrl?: string;
  verbose?: boolean;
  /** Debounce window in milliseconds. Default: 2000. */
  interval?: number;
}

// ── Dedupe helpers ────────────────────────────────────────────────────────────

const seen = new Set<string>();

// v1.2 Track AF — capture the plan signal once at module load. `watch` is a
// long-running process; auth state changes (e.g. user runs `claude logout`)
// are rare and re-running `token-rats watch` is the recovery path.
const watchClaudePlan: SourcePlan = detectClaudeCodePlan();

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
    records = parseClaudeCode(text, { defaultPlan: watchClaudePlan });
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

/** Recursively collect all *.jsonl files under a directory. */
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
  const token = loadToken();
  if (!token) {
    error("Not logged in. Run `token-rats login` first.");
    process.exit(1);
  }

  const client = new ApiClient({ apiUrl: opts.apiUrl, token });
  const debounceMs = opts.interval ?? 2000;
  const dir = claudeCodeProjectsDir();

  if (!fs.existsSync(dir)) {
    warn(`Claude Code projects directory not found: ${dir}`);
    warn("No files to watch. Exiting.");
    process.exit(0);
  }

  info(`Watching ${dir} (debounce: ${debounceMs}ms)`);
  info("Press Ctrl-C to stop.\n");

  // ── 1. Initial snapshot — seed `seen` without uploading ────────────────────
  const initialFiles = findJsonlFiles(dir);
  for (const f of initialFiles) {
    // Parse and mark as seen but don't upload (these were already synced by
    // previous `token-rats sync` runs — or will be uploaded fresh if truly new).
    parseAndFilter(f, false);
  }
  if (opts.verbose) {
    dim(`Initial snapshot: ${seen.size} session(s) in ${initialFiles.length} file(s)`);
  }

  // ── 2. Set up watcher ──────────────────────────────────────────────────────

  const onChanged = makeDebounced(async (filePath: string) => {
    if (!filePath.endsWith(".jsonl")) return;
    const fresh = parseAndFilter(filePath, opts.verbose ?? false);
    if (fresh.length > 0) {
      await upload(client, fresh, opts.verbose ?? false);
    }
  }, debounceMs);

  // Try chokidar first (optional dep), fall back to Node built-in.
  let cleanup: (() => void) | null = null;

  try {
    // Dynamic import — chokidar is an optional dependency.
    // We use Function() to defeat the TypeScript module resolver so that the
    // package being absent at typecheck time doesn't cause a TS2307 error.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chokidar = (await (new Function("m", "return import(m)") as (m: string) => Promise<any>)(
      "chokidar",
    )) as {
      watch: (
        pattern: string,
        opts: Record<string, unknown>,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ) => { on: (event: string, fn: (...args: any[]) => void) => void; close: () => void };
    };
    const watcher = chokidar.watch(`${dir}/**/*.jsonl`, {
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
    });
    watcher.on("add", (p: string) => onChanged(p));
    watcher.on("change", (p: string) => onChanged(p));
    cleanup = () => {
      watcher.close();
    };
    if (opts.verbose) dim("Using chokidar for file watching");
  } catch {
    // chokidar not installed — use Node built-in fs.watch
    if (opts.verbose) dim("chokidar not available; using Node built-in fs.watch");

    // Node's fs.watch is recursive on macOS/Windows but NOT on Linux.
    // On Linux we fall back to polling every `interval` ms by rescanning the dir.
    if (process.platform === "linux") {
      // Poll-based fallback on Linux
      let lastMtimes = new Map<string, number>();

      // Capture initial mtimes
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
            // file disappeared — ignore
          }
        }
        // Track new files
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
      // macOS / Windows — recursive watch is supported natively
      const controller = new AbortController();
      (async () => {
        try {
          const { watch } = await import("node:fs/promises");
          const watcher = watch(dir, { recursive: true, signal: controller.signal });
          for await (const event of watcher) {
            const filename = event.filename;
            if (filename && filename.endsWith(".jsonl")) {
              const fullPath = `${dir}/${filename}`;
              onChanged(fullPath);
            }
          }
        } catch (err) {
          // AbortError is expected on shutdown — ignore it
          if (err instanceof Error && err.name !== "AbortError") {
            warn(`Watcher error: ${err.message}`);
          }
        }
      })();
      cleanup = () => controller.abort();
    }
  }

  // ── 3. Graceful shutdown ───────────────────────────────────────────────────

  function shutdown() {
    info("Shutting down…");
    if (cleanup) cleanup();
    process.exit(0);
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
