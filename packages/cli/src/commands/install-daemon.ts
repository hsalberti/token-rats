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
import { createRequire } from "node:module";
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
  const entry = path.resolve(process.argv[1] ?? "");
  if (!entry.endsWith(".js")) throw new Error("Build the CLI before installing the daemon.");
  const config = process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config");
  const runtime = path.join(config, "token-rats", "runtime");
  fs.mkdirSync(runtime, { recursive: true });
  const script = path.join(runtime, "index.js");
  if (entry !== script) fs.copyFileSync(entry, script);
  fs.writeFileSync(path.join(runtime, "package.json"), '{"type":"module"}\n');
  const require = createRequire(import.meta.url);
  const sqlPackage = path.dirname(require.resolve("sql.js/package.json"));
  const destination = path.join(runtime, "node_modules", "sql.js");
  if (sqlPackage !== destination) fs.cpSync(sqlPackage, destination, { recursive: true });
  const runner = path.join(runtime, "runner.mjs");
  const settings = Object.fromEntries(
    ["XDG_CONFIG_HOME", "CLAUDE_CONFIG_DIR", "CODEX_HOME", "APPDATA"].flatMap((key) =>
      process.env[key] ? [[key, process.env[key]]] : [],
    ),
  );
  fs.writeFileSync(
    runner,
    `Object.assign(process.env, ${JSON.stringify(settings)});\nawait import("./index.js");\n`,
  );
  return { node: process.execPath, script: runner };
}

function xml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
function systemdArg(value: string): string {
  const escaped = value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("%", "%%")
    .replaceAll("$", "$$");
  return `"${escaped}"`;
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

function darwinPlist(node: string, script: string, apiUrl?: string): string {
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
    <string>${xml(node)}</string>
    <string>${xml(script)}</string>
    <string>watch</string>
    ${apiUrl ? `<string>--api-url</string><string>${xml(apiUrl)}</string>` : ""}
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${xml(stdout)}</string>
  <key>StandardErrorPath</key>
  <string>${xml(stderr)}</string>
</dict>
</plist>
`;
}

async function darwinInstall(apiUrl?: string): Promise<void> {
  const { node, script } = resolveCliPath();
  fs.mkdirSync(darwinLogDir(), { recursive: true });
  const plistPath = darwinPlistPath();
  fs.mkdirSync(path.dirname(plistPath), { recursive: true });
  fs.writeFileSync(plistPath, darwinPlist(node, script, apiUrl), { mode: 0o644 });
  await exec("launchctl", ["bootout", `gui/${process.getuid?.() ?? 0}/${LABEL}`]).catch(
    () => undefined,
  );
  // Load the current runtime after installation.
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
    if (stdout.split("\n").some((line) => line.endsWith(LABEL) && /^\d+\s/.test(line)))
      return "running";
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

function linuxUnit(node: string, script: string, apiUrl?: string): string {
  return `[Unit]
Description=Token Rats watcher — live AI usage sync
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=${systemdArg(node)} ${systemdArg(script)} watch${apiUrl ? ` --api-url ${systemdArg(apiUrl)}` : ""}
Restart=on-failure
RestartSec=10s
Environment=NODE_ENV=production

[Install]
WantedBy=default.target
`;
}

async function linuxInstall(apiUrl?: string): Promise<void> {
  const { node, script } = resolveCliPath();
  const unitPath = linuxUnitPath();
  fs.mkdirSync(path.dirname(unitPath), { recursive: true });
  fs.writeFileSync(unitPath, linuxUnit(node, script, apiUrl), { mode: 0o644 });
  try {
    await exec("systemctl", ["--user", "daemon-reload"]);
    await exec("systemctl", ["--user", "enable", "--now", LINUX_UNIT]);
    await exec("systemctl", ["--user", "restart", LINUX_UNIT]);
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

async function windowsInstall(apiUrl?: string): Promise<void> {
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
    `"${node}" "${script}" watch${apiUrl ? ` --api-url "${apiUrl}"` : ""}`,
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

export async function installDaemonCommand(apiUrl?: string): Promise<void> {
  clearDisconnected();
  try {
    if (process.platform === "darwin") {
      await darwinInstall(apiUrl);
    } else if (process.platform === "linux") {
      await linuxInstall(apiUrl);
    } else if (process.platform === "win32") {
      await windowsInstall(apiUrl);
    } else {
      warn(`No daemon installer for platform ${process.platform}; skipping.`);
      return;
    }
    success("Background watcher installed and running.");
    dim("It will pick up sessions from Claude Code, Codex, and Cursor every 30 seconds.");
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
