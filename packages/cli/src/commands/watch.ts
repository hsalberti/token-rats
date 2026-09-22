/** Serialized polling handles new directories, offline retries, and all local sources. */
import { ApiClient, ApiError, DeviceRevokedError } from "../lib/api.js";
import {
  deleteToken,
  ensureDeviceId,
  isDisconnected,
  loadToken,
  markDisconnected,
} from "../lib/auth-store.js";
import { CLI_VERSION } from "../lib/cli-version.js";
import { SyncQueue, createCollector } from "../lib/collect.js";
import { error, info, success, warn } from "../lib/log.js";

export interface WatchOptions {
  apiUrl?: string;
  verbose?: boolean;
  interval?: number;
}

export async function watchCommand(opts: WatchOptions): Promise<void> {
  const token = loadToken();
  if (!token || isDisconnected()) {
    error("Run `token-rats login` before you start the tracker.");
    process.exitCode = 1;
    return;
  }
  const interval = opts.interval ?? 30_000;
  if (!Number.isFinite(interval) || interval < 1000) {
    error("The interval must be at least 1000 milliseconds.");
    process.exitCode = 1;
    return;
  }
  const client = new ApiClient({
    apiUrl: opts.apiUrl,
    token,
    deviceId: ensureDeviceId(),
    cliVersion: CLI_VERSION,
  });
  const queue = new SyncQueue();
  const collect = createCollector();
  let stopped = false;
  let wake: (() => void) | undefined;
  const stop = () => {
    stopped = true;
    wake?.();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  info("Tracking Claude Code, Codex, and Cursor. Press Ctrl-C to stop.");
  try {
    while (!stopped) {
      try {
        const count = await queue.flush(await collect(), (batch) => client.uploadSessions(batch));
        // Empty ingest registers a new device even when no logs exist yet.
        if (count === 0) await client.uploadSessions([]);
        await client.heartbeat();
        if (count > 0) success(`Synced ${count} changed record(s).`);
      } catch (err) {
        if (err instanceof DeviceRevokedError) {
          markDisconnected();
          deleteToken();
          error("Device disconnected. Run `token-rats login` to reconnect.");
          break;
        }
        if (err instanceof ApiError && err.status === 401) {
          error("Session expired. Run `token-rats login` again.");
          process.exitCode = 1;
          break;
        }
        warn(
          `Sync failed. The next scan will retry: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      if (stopped) break;
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, interval);
        wake = () => {
          clearTimeout(timer);
          resolve();
        };
      });
    }
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}
