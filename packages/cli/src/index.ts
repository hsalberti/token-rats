#!/usr/bin/env node
/**
 * token-rats — AI usage tracker and community.
 *
 * Reads local logs and uploads usage metadata, without prompts or completions.
 * Parser source: packages/parsers/.
 *
 * Commands:
 *   token-rats login     Authenticate (device-code flow)
 *   token-rats sync      Discover + upload Claude Code, Codex, and Cursor usage
 *   token-rats watch     Run the autorunner and upload changed sessions
 *   token-rats whoami    Show the signed-in account
 *   token-rats logout    Clear credentials
 *   token-rats --version Show version
 *   token-rats help      Show this help
 */

import { installCursorCommand } from "./commands/install-cursor.js";
import {
  daemonStatusCommand,
  installDaemonCommand,
  uninstallDaemonCommand,
} from "./commands/install-daemon.js";
import { loginCommand } from "./commands/login.js";
import { logoutCommand } from "./commands/logout.js";
import { syncCommand } from "./commands/sync.js";
import { watchCommand } from "./commands/watch.js";
import { whoamiCommand } from "./commands/whoami.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

import { CLI_VERSION } from "./lib/cli-version.js";

function getVersion(): string {
  return CLI_VERSION;
}

function printHelp(): void {
  console.log(`
\x1b[1mtoken-rats\x1b[0m — AI usage tracker and community  \x1b[2mv${getVersion()}\x1b[0m

\x1b[1mUsage:\x1b[0m
  token-rats <command> [flags]

\x1b[1mCommands:\x1b[0m
  login              Authenticate with Token Rats (opens browser); installs the background watcher by default
  sync               Read local Claude Code, Codex + Cursor logs and upload counts
  watch              Watch logs in real-time; upload new sessions as they appear
  whoami             Show the currently signed-in account + device id
  logout             Clear your stored credentials
  install-daemon     Install the background watcher (runs at logon)
  uninstall-daemon   Remove the background watcher
  daemon-status      Show whether the background watcher is running
  install-cursor     Install better-sqlite3 globally for faster Cursor reads
                     (sql.js works out of the box — this is opt-in speed-up)
  help               Show this help message

\x1b[1mFlags (all commands):\x1b[0m
  --api-url <url>   Override API URL (default: https://api.tokenrats.com)

\x1b[1mFlags (sync only):\x1b[0m
  --dry-run         Parse but do not upload; print what would be sent
  --verbose         Print discovered files and per-file record counts

\x1b[1mFlags (watch only):\x1b[0m
  --interval <ms>   Scan interval in ms (default: 30000, minimum: 1000)
  --verbose         Print file change events and upload detail

\x1b[1mPrivacy:\x1b[0m
  Token Rats reads local logs and uploads usage metadata only.
  It does not upload prompts or completions.
  The parser source is in packages/parsers/.

\x1b[1mCursor notes:\x1b[0m
  Cursor doesn't store token counts locally, so per-request tokens
  are *estimated* (10k in / 2k out per composer turn, claude-3-5-sonnet
  rates). Tab autocomplete is excluded. Numbers are comparable across
  Token Rats users but won't match cursor.com to the token.

\x1b[1mExamples:\x1b[0m
  npx token-rats login
  npx token-rats sync
  npx token-rats sync --dry-run --verbose
  npx token-rats whoami
  npx token-rats logout
`);
}

// ── Arg parsing ──────────────────────────────────────────────────────────────

interface ParsedArgs {
  command: string | null;
  apiUrl: string | undefined;
  dryRun: boolean;
  verbose: boolean;
  interval: number | undefined;
  noDaemon: boolean;
  rest: string[];
}

function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  let apiUrl: string | undefined;
  let dryRun = false;
  let verbose = false;
  let interval: number | undefined;
  let noDaemon = false;

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i]!;
    if (arg === "--api-url" && i + 1 < argv.length) {
      apiUrl = argv[++i];
    } else if (arg.startsWith("--api-url=")) {
      apiUrl = arg.slice("--api-url=".length);
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--verbose" || arg === "-v") {
      verbose = true;
    } else if (arg === "--interval" && i + 1 < argv.length) {
      interval = Number(argv[++i]);
    } else if (arg.startsWith("--interval=")) {
      interval = Number(arg.slice("--interval=".length));
    } else if (arg === "--no-daemon") {
      noDaemon = true;
    } else if (arg === "--version" || arg === "-V") {
      console.log(getVersion());
      process.exit(0);
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (!arg.startsWith("-")) {
      positional.push(arg);
    }
    // Unknown flags are silently ignored for forward-compat.
    i++;
  }

  const [command = null, ...rest] = positional;
  return { command, apiUrl, dryRun, verbose, interval, noDaemon, rest };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const { command, apiUrl, dryRun, verbose, interval, noDaemon } = args;

  if (!command || command === "help") {
    printHelp();
    process.exit(0);
  }

  switch (command) {
    case "login":
      await loginCommand({ apiUrl, noDaemon });
      break;

    case "sync":
      await syncCommand({ apiUrl, dryRun, verbose });
      break;

    case "watch":
      await watchCommand({ apiUrl, verbose, interval });
      break;

    case "whoami":
      await whoamiCommand({ apiUrl });
      break;

    case "logout":
      logoutCommand();
      break;

    case "install-cursor":
      await installCursorCommand();
      break;

    case "install-daemon":
      await installDaemonCommand(apiUrl);
      break;

    case "uninstall-daemon":
      await uninstallDaemonCommand();
      break;

    case "daemon-status":
      await daemonStatusCommand();
      break;

    default:
      console.error(`\x1b[31mUnknown command: ${command}\x1b[0m`);
      console.error("Run \x1b[1mtoken-rats help\x1b[0m for a list of commands.");
      process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error(
    `\x1b[31mUnexpected error: ${err instanceof Error ? err.message : String(err)}\x1b[0m`,
  );
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});
