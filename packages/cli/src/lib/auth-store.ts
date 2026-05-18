import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function tokenDir(): string {
  // XDG on Linux/macOS; %APPDATA% on Windows
  const base =
    process.env["XDG_CONFIG_HOME"] ??
    (process.platform === "win32"
      ? (process.env["APPDATA"] ?? path.join(os.homedir(), "AppData", "Roaming"))
      : path.join(os.homedir(), ".config"));
  return path.join(base, "token-rats");
}

function tokenPath(): string {
  return path.join(tokenDir(), "token");
}

export function readToken(): string | null {
  try {
    return fs.readFileSync(tokenPath(), "utf8").trim();
  } catch {
    return null;
  }
}

export function writeToken(token: string): void {
  const dir = tokenDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = tokenPath();
  fs.writeFileSync(file, token, { encoding: "utf8", mode: 0o600 });
}

export function deleteToken(): boolean {
  try {
    fs.unlinkSync(tokenPath());
    return true;
  } catch {
    return false;
  }
}

export function hasToken(): boolean {
  return readToken() !== null;
}
