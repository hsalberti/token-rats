/**
 * Token storage for the taskbar app.
 *
 * v1.2 choice: we use `@tauri-apps/plugin-store`, which persists a JSON file
 * under the OS-appropriate app-data directory (e.g. `~/Library/Application
 * Support/com.tokenrats.taskbar/auth.json` on macOS,
 * `%APPDATA%/com.tokenrats.taskbar/auth.json` on Windows). This is good
 * enough for v1.2 and avoids the keychain prompt friction.
 *
 * v1.3 should switch to the real OS keychain via `tauri-plugin-keyring` or
 * a dedicated Rust command using the `keyring` crate. Tracked in roadmap-v1.3.
 */

import { LazyStore } from "@tauri-apps/plugin-store";

const STORE_FILE = "auth.json";
const TOKEN_KEY = "auth_token";

let store: LazyStore | null = null;
function getStore(): LazyStore {
  if (!store) {
    store = new LazyStore(STORE_FILE);
  }
  return store;
}

export async function saveToken(token: string): Promise<void> {
  const s = getStore();
  await s.set(TOKEN_KEY, token);
  await s.save();
}

export async function loadToken(): Promise<string | null> {
  const s = getStore();
  const value = await s.get<string>(TOKEN_KEY);
  return typeof value === "string" && value.length > 0 ? value : null;
}

export async function deleteToken(): Promise<void> {
  const s = getStore();
  await s.delete(TOKEN_KEY);
  await s.save();
}
