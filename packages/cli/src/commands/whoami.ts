/**
 * token-rats whoami
 *
 * Reads the stored auth token and calls GET /v1/me to show the signed-in account.
 */

import { ApiClient, ApiError } from "../lib/api.js";
import { loadToken } from "../lib/auth-store.js";
import { error, info } from "../lib/log.js";

export async function whoamiCommand(opts: { apiUrl?: string }): Promise<void> {
  const token = loadToken();
  if (!token) {
    error("Not logged in. Run `token-rats login` first.");
    process.exit(1);
  }

  const client = new ApiClient({ apiUrl: opts.apiUrl, token });

  try {
    const res = await client.getMe();
    info(`Signed in as \x1b[1m@${res.user.handle}\x1b[0m`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      error("Your session has expired. Run `token-rats login` to re-authenticate.");
      process.exit(1);
    }
    error(`Failed to fetch account: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
