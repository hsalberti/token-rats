/**
 * Discovers Claude Code .jsonl files, Codex rollout .jsonl files, and the
 * Cursor sqlite cache across macOS, Linux, and Windows.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/** Recursively collect all *.jsonl files under a directory. */
function findJsonlFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findJsonlFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      results.push(full);
    }
  }
  return results;
}

/** Returns the Claude Code projects directory for the current platform. */
export function claudeCodeProjectsDir(): string {
  const home = os.homedir();
  if (process.env.CLAUDE_CONFIG_DIR) return path.join(process.env.CLAUDE_CONFIG_DIR, "projects");
  if (process.platform === "win32") {
    const profile = process.env.USERPROFILE ?? home;
    return path.join(profile, ".claude", "projects");
  }
  return path.join(home, ".claude", "projects");
}

/** Discover all Claude Code .jsonl files. */
export function discoverClaudeCodeFiles(): string[] {
  const dir = claudeCodeProjectsDir();
  return findJsonlFiles(dir);
}

/**
 * Returns the candidate Codex `sessions/` directories for the current
 * platform. Codex writes rollout JSONL files under `<codex-home>/sessions/`,
 * organized as `YYYY/MM/DD/rollout-<iso-stamp>-<session-id>.jsonl`.
 *
 * `<codex-home>` defaults to `~/.codex` but the Snap and Flatpak distros
 * sandbox it elsewhere, so we probe several known locations.
 */
export function codexSessionsDirs(): string[] {
  const home = os.homedir();
  const candidates: string[] = [];
  if (process.env.CODEX_HOME) {
    candidates.push(path.join(process.env.CODEX_HOME, "sessions"));
    candidates.push(path.join(process.env.CODEX_HOME, "archived_sessions"));
  }

  if (process.platform === "win32") {
    const profile = process.env.USERPROFILE ?? home;
    candidates.push(path.join(profile, ".codex", "sessions"));
    candidates.push(path.join(profile, ".codex", "archived_sessions"));
    const appData = process.env.APPDATA ?? path.join(profile, "AppData", "Roaming");
    candidates.push(path.join(appData, "Codex", "sessions"));
  } else {
    candidates.push(path.join(home, ".codex", "sessions"));
    candidates.push(path.join(home, ".codex", "archived_sessions"));
    // Snap (Linux): sessions live under a versioned `current` symlink as well
    // as the active version directory. Walk the snap root and pick up any
    // `sessions/` we find.
    const snapRoot = path.join(home, "snap", "codex");
    if (fs.existsSync(snapRoot)) {
      for (const entry of fs.readdirSync(snapRoot, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          candidates.push(path.join(snapRoot, entry.name, "sessions"));
        }
      }
    }
    // macOS: same as Linux default; no separate Application Support path.
  }

  // De-dupe (Snap's `current` symlink can resolve to a numbered version dir
  // that we'd otherwise scan twice). Keep only existing dirs.
  const seen = new Set<string>();
  const dirs: string[] = [];
  for (const c of candidates) {
    try {
      const real = fs.existsSync(c) ? fs.realpathSync(c) : null;
      if (real && !seen.has(real)) {
        seen.add(real);
        dirs.push(c);
      }
    } catch {
      // ignore unreadable candidates
    }
  }
  return dirs;
}

/** Discover all Codex rollout .jsonl files across known Codex home dirs. */
export function discoverCodexFiles(): string[] {
  const out: string[] = [];
  for (const dir of codexSessionsDirs()) {
    out.push(...findJsonlFiles(dir));
  }
  return out;
}

/** Returns the Cursor sqlite DB path for the current platform. */
export function cursorDbPath(): string {
  const home = os.homedir();
  const rel = path.join("Cursor", "User", "globalStorage", "state.vscdb");

  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", rel);
  }
  if (process.platform === "win32") {
    const appData = process.env.APPDATA ?? path.join(home, "AppData", "Roaming");
    return path.join(appData, rel);
  }
  // Linux (and everything else)
  const xdgConfig = process.env.XDG_CONFIG_HOME ?? path.join(home, ".config");
  return path.join(xdgConfig, rel);
}

/** Returns the Cursor DB path if it exists, otherwise null. */
export function discoverCursorDb(): string | null {
  const p = cursorDbPath();
  return fs.existsSync(p) ? p : null;
}
