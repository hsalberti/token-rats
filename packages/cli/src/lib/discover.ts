/**
 * Discovers Claude Code .jsonl files and the Cursor sqlite cache
 * across macOS, Linux, and Windows.
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
