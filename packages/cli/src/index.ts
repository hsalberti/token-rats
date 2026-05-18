#!/usr/bin/env node
// Phase 0 stub. Phase 1 / Track B fills in real commands: login, sync, whoami.
const [, , cmd] = process.argv;
if (!cmd || cmd === "help") {
  console.log("token-rats — sync your AI token usage to your leaderboard");
  console.log("");
  console.log("Commands:");
  console.log("  token-rats login    Authenticate with GitHub (device-code flow)");
  console.log("  token-rats sync     Read local Claude Code + Cursor logs and upload counts");
  console.log("  token-rats whoami   Show the signed-in account");
  process.exit(0);
}
console.error(`Unknown command: ${cmd}`);
process.exit(1);
