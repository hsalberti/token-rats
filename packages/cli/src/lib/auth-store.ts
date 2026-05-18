/**
 * Stores/retrieves the CLI auth token at ~/.config/token-rats/token
 * with mode 0600 (owner read/write only).
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

function tokenDir(): string {
  const xdgConfig = process.env.XDG_CONFIG_HOME;
  const base = xdgConfig ?? path.join(os.homedir(), ".config");
  return path.join(base, "token-rats");
}

function tokenPath(): string {
  return path.join(tokenDir(), "token");
}

export function saveToken(token: string): void {
  const dir = tokenDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = tokenPath();
  fs.writeFileSync(file, token, { encoding: "utf8", mode: 0o600 });
}

export function loadToken(): string | null {
  const file = tokenPath();
  try {
    const token = fs.readFileSync(file, "utf8").trim();
    return token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

export function deleteToken(): void {
  const file = tokenPath();
  try {
    fs.unlinkSync(file);
  } catch {
    // already gone — that's fine
  }
}

export function isLoggedIn(): boolean {
  return loadToken() !== null;
}
