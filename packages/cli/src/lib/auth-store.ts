/**
 * Per-install CLI state at ~/.config/token-rats/.
 *
 *   token              — opaque session token (mode 0600)
 *   state.json         — `{ deviceId, createdAt }`. The opaque id we send as
 *                        `X-Device-Id` on every request. Generated on first
 *                        use and never sent in clear except via the header
 *                        the server expects.
 *   devices.json       — `{ <deviceId>: { label, hostname, os, lastSyncedAt } }`
 *                        local-only metadata about devices this CLI has named.
 *                        The server never sees this file's contents.
 *   disconnected       — sentinel touched when the server returns
 *                        `device_revoked`. The daemon checks for it on
 *                        startup and refuses to run.
 */

import * as crypto from "node:crypto";
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

function statePath(): string {
  return path.join(tokenDir(), "state.json");
}

function devicesPath(): string {
  return path.join(tokenDir(), "devices.json");
}

function disconnectedPath(): string {
  return path.join(tokenDir(), "disconnected");
}

export function saveToken(token: string): void {
  const dir = tokenDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(tokenPath(), token, { encoding: "utf8", mode: 0o600 });
}

export function loadToken(): string | null {
  try {
    const token = fs.readFileSync(tokenPath(), "utf8").trim();
    return token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

export function deleteToken(): void {
  try {
    fs.unlinkSync(tokenPath());
  } catch {
    // already gone
  }
}

export function isLoggedIn(): boolean {
  return loadToken() !== null;
}

/* -------------------------------------------------------------------------- */
/* Device id                                                                   */
/* -------------------------------------------------------------------------- */

interface ClientState {
  deviceId: string;
  createdAt: number;
}

/**
 * Return the per-install device id, generating + persisting it on first call.
 * The id is a v4-shaped UUID; we only need uniqueness, not cryptographic
 * unguessability, but `crypto.randomUUID()` gives us both for free.
 */
export function ensureDeviceId(): string {
  try {
    const raw = fs.readFileSync(statePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<ClientState>;
    if (typeof parsed.deviceId === "string" && parsed.deviceId.length > 0) {
      return parsed.deviceId;
    }
  } catch {
    // No file or unreadable → generate fresh below.
  }

  const dir = tokenDir();
  fs.mkdirSync(dir, { recursive: true });
  const deviceId = crypto.randomUUID();
  const state: ClientState = { deviceId, createdAt: Date.now() };
  fs.writeFileSync(statePath(), JSON.stringify(state, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
  return deviceId;
}

export function clearDeviceState(): void {
  try {
    fs.unlinkSync(statePath());
  } catch {
    // ignore
  }
}

/* -------------------------------------------------------------------------- */
/* Friendly-name cache (client-side only)                                      */
/* -------------------------------------------------------------------------- */

export interface DeviceLabel {
  label?: string;
  hostname?: string;
  os?: string;
  lastSyncedAt?: number;
}

export function loadDeviceLabels(): Record<string, DeviceLabel> {
  try {
    const raw = fs.readFileSync(devicesPath(), "utf8");
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function setDeviceLabel(deviceId: string, label: DeviceLabel): void {
  const all = loadDeviceLabels();
  all[deviceId] = { ...(all[deviceId] ?? {}), ...label };
  const dir = tokenDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(devicesPath(), JSON.stringify(all, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
}

/* -------------------------------------------------------------------------- */
/* Disconnect sentinel                                                         */
/* -------------------------------------------------------------------------- */

export function markDisconnected(): void {
  const dir = tokenDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(disconnectedPath(), String(Date.now()), { mode: 0o600 });
}

export function clearDisconnected(): void {
  try {
    fs.unlinkSync(disconnectedPath());
  } catch {
    // ignore
  }
}

export function isDisconnected(): boolean {
  return fs.existsSync(disconnectedPath());
}
