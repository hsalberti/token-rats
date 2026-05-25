/**
 * token-rats install-daemon / uninstall-daemon / daemon-status
 *
 * Cross-platform installer for the `token-rats watch` background process.
 * - macOS: launchd LaunchAgent (`~/Library/LaunchAgents/com.tokenrats.watch.plist`).
 * - Linux: systemd user unit (`~/.config/systemd/user/token-rats-watch.service`).
 * - Windows: Scheduled Task at logon (via `schtasks`).
 *
 * The daemon runs `token-rats watch` with whatever node binary launched the
 * installer (resolved via `process.execPath`), so installs done via `npx` use
 * the same node + script path the user just ran.
 */

import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import { clearDisconnected } from "../lib/auth-store.js";
import { dim, error, info, success, warn } from "../lib/log.js";

const exec = promisify(execFile);

const LABEL = "com.tokenrats.watch";
const LINUX_UNIT = "token-rats-watch.service";
const WINDOWS_TASK = "TokenRatsWatch";

/** Best-effort lookup of the on-disk `token-rats` executable. */
function resolveCliPath(): { node: string; script: string } {
  // `process.argv[1]` is the absolute path to the entrypoint script when run
  // via node, or the binary path when run as a packaged install. Either way,
  // re-launching the same string with the same node works.
  const script = process.argv[1] ?? "token-rats";
  return { node: process.execPath, script };
}

/* -------------------------------------------------------------------------- */
/* macOS — launchd                                                             */
/* -------------------------------------------------------------------------- */

function darwinPlistPath(): string {
  return path.join(os.homedir(), "Library", "LaunchAgents", `${LABEL}.plist`);
}

function darwinLogDir(): string {
  return path.join(os.homedir(), "Library", "Logs", "token-rats");
}

function darwinPlist(node: string, script: string): string {
  const logDir = darwinLogDir();
  const stdout = path.join(logDir, "watch.out.log");
  const stderr = path.join(logDir, "watch.err.log");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${node}</string>
    <string>${script}</string>
    <string>watch</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${stdout}</string>
  <key>StandardErrorPath</key>
  <string>${stderr}</string>
</dict>
</plist>
`;
}

async function darwinInstall(): Promise<void> {
  const { node, script } = resolveCliPath();
  fs.mkdirSync(darwinLogDir(), { recursive: true });
  const plistPath = darwinPlistPath();
  fs.mkdirSync(path.dirname(plistPath), { recursive: true });
  fs.writeFileSync(plistPath, darwinPlist(node, script), { mode: 0o644 });
  // `launchctl bootstrap` is the modern verb; fall back to `load` on older OS.
  try {
    await exec("launchctl", ["bootstrap", `gui/${process.getuid?.() ?? 0}`, plistPath]);
  } catch {
    try {
      await exec("launchctl", ["load", plistPath]);
    } catch (err) {
      throw new Error(
        `Wrote ${plistPath} but failed to load it: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

async function darwinUninstall(): Promise<void> {
  const plistPath = darwinPlistPath();
  try {
    await exec("launchctl", ["bootout", `gui/${process.getuid?.() ?? 0}/${LABEL}`]);
  } catch {
    try {
      await exec("launchctl", ["unload", plistPath]);
    } catch {
      // ignore — unit may already be unloaded
    }
  }
  try {
    fs.unlinkSync(plistPath);
  } catch {
    // ignore — file may already be gone
  }
}

async function darwinStatus(): Promise<"running" | "stopped" | "not-installed"> {
  if (!fs.existsSync(darwinPlistPath())) return "not-installed";
  try {
    const { stdout } = await exec("launchctl", ["list"]);
    if (stdout.split("\n").some((line) => line.endsWith(LABEL))) return "running";
    return "stopped";
  } catch {
    return "stopped";
  }
}

/* -------------------------------------------------------------------------- */
/* Linux — systemd user                                                        */
/* -------------------------------------------------------------------------- */

function linuxUnitPath(): string {
  const xdgConfig = process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config");
  return path.join(xdgConfig, "systemd", "user", LINUX_UNIT);
}

function linuxUnit(node: string, script: string): string {
  return `[Unit]
Description=Token Rats watcher — live AI usage sync
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=${node} ${script} watch
Restart=on-failure
RestartSec=10s
Environment=NODE_ENV=production

[Install]
WantedBy=default.target
`;
}

async function linuxInstall(): Promise<void> {
  const { node, script } = resolveCliPath();
  const unitPath = linuxUnitPath();
  fs.mkdirSync(path.dirname(unitPath), { recursive: true });
  fs.writeFileSync(unitPath, linuxUnit(node, script), { mode: 0o644 });
  try {
    await exec("systemctl", ["--user", "daemon-reload"]);
    await exec("systemctl", ["--user", "enable", "--now", LINUX_UNIT]);
  } catch (err) {
    throw new Error(
      `Wrote ${unitPath} but failed to enable+start it: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

async function linuxUninstall(): Promise<void> {
  try {
    await exec("systemctl", ["--user", "disable", "--now", LINUX_UNIT]);
  } catch {
    // ignore — unit may already be disabled
  }
  try {
    fs.unlinkSync(linuxUnitPath());
  } catch {
    // ignore
  }
  try {
    await exec("systemctl", ["--user", "daemon-reload"]);
  } catch {
    // ignore
  }
}

async function linuxStatus(): Promise<"running" | "stopped" | "not-installed"> {
  if (!fs.existsSync(linuxUnitPath())) return "not-installed";
  try {
    const { stdout } = await exec("systemctl", ["--user", "is-active", LINUX_UNIT]);
    return stdout.trim() === "active" ? "running" : "stopped";
  } catch {
    return "stopped";
  }
}

/* -------------------------------------------------------------------------- */
/* Windows — Scheduled Task                                                    */
/* -------------------------------------------------------------------------- */

async function windowsInstall(): Promise<void> {
  const { node, script } = resolveCliPath();
  // /SC ONLOGON triggers at user logon; /RL LIMITED runs as the current user;
  // /F overwrites if the task already exists.
  await exec("schtasks", [
    "/Create",
    "/SC",
    "ONLOGON",
    "/TN",
    WINDOWS_TASK,
    "/TR",
    `"${node}" "${script}" watch`,
    "/RL",
    "LIMITED",
    "/F",
  ]);
  // Run it immediately as well so the user sees a live device right away.
  try {
    await exec("schtasks", ["/Run", "/TN", WINDOWS_TASK]);
  } catch {
    // not fatal — it'll start at next logon
  }
}

async function windowsUninstall(): Promise<void> {
  try {
    await exec("schtasks", ["/End", "/TN", WINDOWS_TASK]);
  } catch {
    // ignore
  }
  try {
    await exec("schtasks", ["/Delete", "/TN", WINDOWS_TASK, "/F"]);
  } catch {
    // ignore
  }
}

async function windowsStatus(): Promise<"running" | "stopped" | "not-installed"> {
  try {
    const { stdout } = await exec("schtasks", ["/Query", "/TN", WINDOWS_TASK, "/FO", "CSV", "/NH"]);
    if (stdout.includes("Running")) return "running";
    return "stopped";
  } catch {
    return "not-installed";
  }
}

/* -------------------------------------------------------------------------- */
/* Dispatchers                                                                 */
/* -------------------------------------------------------------------------- */

export async function installDaemonCommand(): Promise<void> {
  clearDisconnected();
  try {
    if (process.platform === "darwin") {
      await darwinInstall();
    } else if (process.platform === "linux") {
      await linuxInstall();
    } else if (process.platform === "win32") {
      await windowsInstall();
    } else {
      warn(`No daemon installer for platform ${process.platform}; skipping.`);
      return;
    }
    success("Background watcher installed and running.");
    dim("It will pick up new sessions from Claude Code logs in real time.");
    dim("Manage it with `token-rats daemon-status` and `token-rats uninstall-daemon`.");
  } catch (err) {
    error(`Failed to install daemon: ${err instanceof Error ? err.message : String(err)}`);
    warn("You can still run `token-rats sync` manually.");
  }
}

export async function uninstallDaemonCommand(): Promise<void> {
  if (process.platform === "darwin") {
    await darwinUninstall();
  } else if (process.platform === "linux") {
    await linuxUninstall();
  } else if (process.platform === "win32") {
    await windowsUninstall();
  } else {
    warn(`No daemon installer for platform ${process.platform}; nothing to remove.`);
    return;
  }
  info("Daemon removed. `token-rats sync` will still work manually.");
}

export async function daemonStatusCommand(): Promise<void> {
  let status: "running" | "stopped" | "not-installed";
  if (process.platform === "darwin") status = await darwinStatus();
  else if (process.platform === "linux") status = await linuxStatus();
  else if (process.platform === "win32") status = await windowsStatus();
  else {
    warn(`No daemon for platform ${process.platform}.`);
    return;
  }
  if (status === "running") success("Token Rats watcher is running.");
  else if (status === "stopped") warn("Token Rats watcher is installed but not running.");
  else info("Token Rats watcher is not installed. Run `token-rats install-daemon` to start it.");
}
