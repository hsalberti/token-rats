import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import type { SetupWatcher } from "@token-rats/contracts";
import { ApiClient } from "../lib/api.js";
import { ensureDeviceId, loadToken } from "../lib/auth-store.js";
import { CLI_VERSION } from "../lib/cli-version.js";
import { info, success } from "../lib/log.js";
import {
  globalInstructionFiles,
  readInstructions,
  readTracking,
  writeTracking,
} from "../lib/setup-tracking.js";
import { installDaemonCommand } from "./install-daemon.js";
import { loginCommand } from "./login.js";

export async function setupTrackCommand(opts: {
  apiUrl?: string;
  file?: string;
  yes?: boolean;
  stop?: boolean;
  status?: boolean;
  dryRun?: boolean;
  noDaemon?: boolean;
}) {
  const local = readTracking();
  if (opts.status) {
    console.log(
      local.length
        ? local
            .map((s) => `${s.enabled ? "Configured" : "Not enabled"}: ${s.path} (${s.label})`)
            .join("\n")
        : "No files tracked. Run token-rats setup-track.",
    );
    info("Friends and capture status: https://tokenrats.com/app/setups#automatic");
    return;
  }
  const files = opts.file
    ? [{ path: resolve(opts.file), label: "My global instructions" }]
    : globalInstructionFiles();
  if (!opts.stop && !files.length)
    throw Error("No global AGENTS.md found. Run token-rats setup-track /path/to/AGENTS.md.");
  const previews = opts.stop ? [] : files.map((f) => ({ ...f, content: readInstructions(f.path) }));
  if (!opts.stop) {
    info("Automatically share these global instructions with FRIENDS ONLY.");
    console.log(
      "Friends: people on a shared private board, or people you follow who also follow you.",
    );
    console.log(
      "Current and future friends can read the saved history. Changes appear after about a minute.",
    );
    for (const f of previews) console.log(`\n${f.label}: ${f.path}\n\n${f.content}\n`);
    console.log(
      "Common credential lines are omitted. Review the preview; other private text must be removed or wrapped in <!-- token-rats:private --> ... <!-- /token-rats:private -->.",
    );
    console.log(
      "Pause from My setups or token-rats setup-track --stop. Saved versions remain until you hide or delete them.",
    );
    if (opts.dryRun) {
      info("Preview only. Nothing uploaded or enabled.");
      return;
    }
    if (!opts.yes) {
      if (!process.stdin.isTTY)
        throw Error("Review with --dry-run, then use --yes to enable friends-only sharing.");
      const prompt = createInterface({ input: process.stdin, output: process.stdout });
      try {
        if (
          !/^y(es)?$/i.test(
            (
              await prompt.question(
                "Share these files with friends and track future changes? [y/N] ",
              )
            ).trim(),
          )
        )
          return;
      } finally {
        prompt.close();
      }
    }
  }
  if (!loadToken()) await loginCommand({ apiUrl: opts.apiUrl, noDaemon: true });
  const deviceId = ensureDeviceId();
  const client = new ApiClient({
    apiUrl: opts.apiUrl,
    token: loadToken()!,
    deviceId,
    cliVersion: CLI_VERSION,
  });
  if (opts.stop) {
    for (const source of local.filter((s) => !opts.file || s.path === resolve(opts.file))) {
      await client.put(`/v1/setups/watchers/${source.id}`, { enabled: false });
    }
    writeTracking(local);
    success("Automatic setup sharing paused. Your saved history is unchanged.");
    return;
  }
  for (const f of previews) {
    let source = local.find((s) => s.path === f.path);
    if (!source) {
      source = { id: randomUUID(), path: f.path, label: f.label, enabled: false };
      local.push(source);
      writeTracking(local);
    }
    const { watcher } = await client.post<{ watcher: SetupWatcher }>("/v1/setups/watchers", {
      id: source.id,
      deviceId,
      label: source.label,
      content: f.content,
    });
    if (!watcher.enabled) await client.put(`/v1/setups/watchers/${source.id}`, { enabled: true });
    source.enabled = true;
    writeTracking(local);
    success(`${source.label}: friends only → https://tokenrats.com/setups/${watcher.setupId}`);
  }
  if (!opts.noDaemon) {
    info(
      "Installing the Token Rats background tracker for usage and your selected instruction files…",
    );
    await installDaemonCommand(opts.apiUrl);
  } else
    info("Run token-rats watch to capture changes (--no-daemon skipped background installation).");
}
