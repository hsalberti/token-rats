import { ApiClient } from "../lib/api.js";
import { writeToken } from "../lib/auth-store.js";
import { log } from "../lib/log.js";

/** Try to open the URL in the default browser. Fails silently. */
async function openBrowser(url: string): Promise<void> {
  try {
    const { default: open } = await import("open");
    await open(url);
  } catch {
    // open is optional — ignore
  }
}

/** Try to copy text to clipboard. Fails silently. */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    const { default: clipboardy } = await import("clipboardy");
    await clipboardy.write(text);
    return true;
  } catch {
    return false;
  }
}

export interface LoginOptions {
  apiUrl: string;
}

export async function loginCommand(opts: LoginOptions): Promise<void> {
  const client = new ApiClient(opts.apiUrl);

  log.info("Initiating device-code login…");

  let exchange: { verificationUrl: string; pollToken: string; expiresIn: number };
  try {
    exchange = await client.cliExchange();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error(`Failed to start auth flow: ${msg}`);
    process.exit(1);
  }

  const { verificationUrl, pollToken, expiresIn } = exchange;

  // Extract the code from the URL for display
  const urlObj = new URL(verificationUrl);
  const code = urlObj.searchParams.get("code") ?? "";

  log.plain("");
  log.bold("  Open this URL to sign in:");
  log.plain(`  ${verificationUrl}`);
  if (code) {
    log.plain("");
    log.plain(`  Code: \x1b[1m${code}\x1b[0m`);
  }
  log.plain("");
  log.dim(`  (Expires in ${expiresIn}s)`);
  log.plain("");

  // Best-effort clipboard + browser
  if (code) {
    const copied = await copyToClipboard(code);
    if (copied) log.dim("  Code copied to clipboard.");
  }
  await openBrowser(verificationUrl);

  log.info("Waiting for browser confirmation…");

  const deadline = Date.now() + expiresIn * 1000;
  let token: string | null = null;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      token = await client.cliPoll(pollToken);
      if (token) break;
    } catch (err) {
      // status 410 = expired
      const apiErr = err as { status?: number };
      if (apiErr.status === 410) {
        log.error("Auth code expired. Run `token-rats login` again.");
        process.exit(1);
      }
      // Other errors: keep polling
    }
  }

  if (!token) {
    log.error("Timed out waiting for login. Run `token-rats login` again.");
    process.exit(1);
  }

  writeToken(token);
  log.success("Logged in! Run `token-rats whoami` to confirm.");
}
