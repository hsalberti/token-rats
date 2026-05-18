import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Recursively find all files matching a suffix under a base directory. */
function findFiles(dir: string, suffix: string): string[] {
  const results: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFiles(full, suffix));
    } else if (entry.isFile() && entry.name.endsWith(suffix)) {
      results.push(full);
    }
  }
  return results;
}

/** Resolve Claude Code log directory for the current platform. */
export function claudeCodeLogDir(): string {
  const home = os.homedir();
  if (process.platform === "win32") {
    const userprofile = process.env["USERPROFILE"] ?? home;
    return path.join(userprofile, ".claude", "projects");
  }
  return path.join(home, ".claude", "projects");
}

/** Discover all Claude Code .jsonl log files. */
export function discoverClaudeCodeFiles(): string[] {
  const dir = claudeCodeLogDir();
  return findFiles(dir, ".jsonl");
}

/** Resolve the Cursor sqlite path for the current platform. */
export function cursorDbPath(): string | null {
  const home = os.homedir();
  switch (process.platform) {
    case "darwin":
      return path.join(
        home,
        "Library",
        "Application Support",
        "Cursor",
        "User",
        "globalStorage",
        "state.vscdb",
      );
    case "linux":
      return path.join(
        home,
        ".config",
        "Cursor",
        "User",
        "globalStorage",
        "state.vscdb",
      );
    case "win32": {
      const appdata = process.env["APPDATA"] ?? path.join(home, "AppData", "Roaming");
      return path.join(appdata, "Cursor", "User", "globalStorage", "state.vscdb");
    }
    default:
      return null;
  }
}

/** Return the Cursor db path only if the file exists. */
export function discoverCursorDb(): string | null {
  const p = cursorDbPath();
  if (!p) return null;
  try {
    fs.accessSync(p, fs.constants.R_OK);
    return p;
  } catch {
    return null;
  }
}
