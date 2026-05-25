/**
 * token-rats whoami
 *
 * Reads the stored auth token and calls GET /v1/me to show the signed-in account.
 */

import { ApiClient, ApiError, DeviceRevokedError } from "../lib/api.js";
import { deleteToken, ensureDeviceId, loadToken, markDisconnected } from "../lib/auth-store.js";
import { CLI_VERSION } from "../lib/cli-version.js";
import { error, info } from "../lib/log.js";

export async function whoamiCommand(opts: { apiUrl?: string }): Promise<void> {
  const token = loadToken();
  if (!token) {
    error("Not logged in. Run `token-rats login` first.");
    process.exit(1);
  }

  const client = new ApiClient({
    apiUrl: opts.apiUrl,
    token,
    deviceId: ensureDeviceId(),
    cliVersion: CLI_VERSION,
  });

  try {
    const res = await client.getMe();
    info(`Signed in as \x1b[1m@${res.user.handle}\x1b[0m`);
    info(`Device id: ${ensureDeviceId()}`);
  } catch (err) {
    if (err instanceof DeviceRevokedError) {
      markDisconnected();
      deleteToken();
      error(
        "This device was disconnected from the Token Rats web UI. Run `token-rats login` to reconnect.",
      );
      process.exit(1);
    }
    if (err instanceof ApiError && err.status === 401) {
      error("Your session has expired. Run `token-rats login` to re-authenticate.");
      process.exit(1);
    }
    error(`Failed to fetch account: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
