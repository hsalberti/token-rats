/**
 * token-rats login
 *
 * Device-code-style auth flow:
 * 1. Call POST /v1/auth/cli/exchange to get a verificationUrl + pollToken.
 * 2. Show the URL (copy to clipboard + open browser if possible).
 * 3. Poll POST /v1/auth/cli/poll every 2s until the user approves or it expires.
 * 4. Save the returned token to ~/.config/token-rats/token (mode 0600).
 */

import { ApiClient } from "../lib/api.js";
import { clearDisconnected, ensureDeviceId, saveToken } from "../lib/auth-store.js";
import { CLI_VERSION } from "../lib/cli-version.js";
import { dim, error, info, spinner, success } from "../lib/log.js";
import { installDaemonCommand } from "./install-daemon.js";

export interface LoginOptions {
  apiUrl?: string;
  /** When true, skip the post-login daemon install (still does device id setup). */
  noDaemon?: boolean;
}

/** Attempt to open a URL in the default browser. No-op if `open` is missing. */
async function openBrowser(url: string): Promise<void> {
  try {
    // Prefer the `open` npm package; fall back to platform-native commands.
    const mod = await import("open").catch(() => null);
    if (mod) {
      await mod.default(url);
      return;
    }
  } catch {
    // ignore
  }

  // Platform fallback
  try {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const exec = promisify(execFile);
    const cmd =
      process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
    const args = process.platform === "win32" ? ["/c", "start", url] : [url];
    await exec(cmd, args).catch(() => null);
  } catch {
    // ignore
  }
}

/** Attempt to copy text to the clipboard. Silently ignores failures. */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    const mod = await import("clipboardy").catch(() => null);
    if (mod) {
      await mod.default.write(text);
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

export async function loginCommand(opts: LoginOptions): Promise<void> {
  const deviceId = ensureDeviceId();
  const client = new ApiClient({
    apiUrl: opts.apiUrl,
    deviceId,
    cliVersion: CLI_VERSION,
  });

  info("Authenticating with Token Rats…");

  let exchange: { verificationUrl: string; pollToken: string; expiresIn: number };
  try {
    exchange = await client.cliExchange();
  } catch (err) {
    error(`Failed to start authentication: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  const { verificationUrl, pollToken, expiresIn } = exchange;

  // Extract the short code from the URL for display
  const codeMatch = verificationUrl.match(/[?&]code=([A-Z0-9-]+)/);
  const code = codeMatch?.[1] ?? "";

  console.log("");
  console.log("  Open this URL to sign in:");
  console.log(`  \x1b[1m\x1b[36m${verificationUrl}\x1b[0m`);
  if (code) {
    console.log(`  Code: \x1b[1m${code}\x1b[0m`);
  }
  console.log(`  Expires in ${Math.floor(expiresIn / 60)} minutes.`);
  console.log("");

  const copied = await copyToClipboard(verificationUrl);
  if (copied) {
    info("URL copied to clipboard.");
  }

  await openBrowser(verificationUrl);

  const spin = spinner("Waiting for you to approve in the browser");

  const deadline = Date.now() + expiresIn * 1000;
  let token: string | null = null;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000));

    try {
      token = await client.cliPoll(pollToken);
    } catch (err) {
      if (err instanceof Error && err.message.includes("410")) {
        spin.stop();
        error("The authentication code expired. Please run `token-rats login` again.");
        process.exit(1);
      }
      // Other errors: keep polling
      continue;
    }

    if (token !== null) break;
  }

  spin.stop();

  if (!token) {
    error("Authentication timed out. Please run `token-rats login` again.");
    process.exit(1);
  }

  saveToken(token);
  clearDisconnected();
  success("Logged in! Run `token-rats whoami` to verify.");
  dim(`Device id: ${deviceId}`);

  if (opts.noDaemon) {
    info("Skipping background watcher install (--no-daemon).");
    info("Run `token-rats sync` manually whenever you want to upload usage.");
    return;
  }

  info("Installing background watcher so usage uploads automatically…");
  await installDaemonCommand(opts.apiUrl);
}
