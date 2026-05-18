#!/usr/bin/env node
/**
 * token-rats — Strava for AI token burn.
 *
 * Reads usage counts only — never prompts or completions.
 * Parser source: packages/parsers/ — we literally can't read what you typed.
 *
 * Commands:
 *   token-rats login     Authenticate (device-code flow)
 *   token-rats sync      Discover + upload Claude Code & Cursor usage
 *   token-rats watch     Watch logs in real-time and upload new sessions
 *   token-rats whoami    Show the signed-in account
 *   token-rats logout    Clear credentials
 *   token-rats --version Show version
 *   token-rats help      Show this help
 */

import { loginCommand } from "./commands/login.js";
import { logoutCommand } from "./commands/logout.js";
import { syncCommand } from "./commands/sync.js";
import { watchCommand } from "./commands/watch.js";
import { whoamiCommand } from "./commands/whoami.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function getVersion(): string {
  return "0.0.1";
}

function printHelp(): void {
  console.log(`
\x1b[1mtoken-rats\x1b[0m — Strava for AI token burn  \x1b[2mv${getVersion()}\x1b[0m

\x1b[1mUsage:\x1b[0m
  token-rats <command> [flags]

\x1b[1mCommands:\x1b[0m
  login      Authenticate with Token Rats (opens browser)
  sync       Read local Claude Code + Cursor logs and upload counts
  watch      Watch logs in real-time; upload new sessions as they appear
  whoami     Show the currently signed-in account
  logout     Clear your stored credentials
  help       Show this help message

\x1b[1mFlags (all commands):\x1b[0m
  --api-url <url>   Override API URL (default: https://api.tokenrats.dev)

\x1b[1mFlags (sync only):\x1b[0m
  --dry-run         Parse but do not upload; print what would be sent
  --verbose         Print discovered files and per-file record counts

\x1b[1mFlags (watch only):\x1b[0m
  --interval <ms>   Debounce window in ms before uploading (default: 2000)
  --verbose         Print file change events and upload detail

\x1b[1mPrivacy:\x1b[0m
  Token Rats reads usage counts only — never prompts or completions.
  The parser source is in packages/parsers/. We literally can't read
  what you typed.

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
  rest: string[];
}

function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  let apiUrl: string | undefined;
  let dryRun = false;
  let verbose = false;
  let interval: number | undefined;

  let i = 0;
  while (i < argv.length) {
    // biome-ignore lint/style/noNonNullAssertion: i is bounded by the while condition
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
  return { command, apiUrl, dryRun, verbose, interval, rest };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const { command, apiUrl, dryRun, verbose, interval } = args;

  if (!command || command === "help") {
    printHelp();
    process.exit(0);
  }

  switch (command) {
    case "login":
      await loginCommand({ apiUrl });
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
