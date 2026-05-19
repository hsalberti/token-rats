/**
 * `token-rats install-cursor`
 *
 * Installs the optional `better-sqlite3` native module for users who want
 * faster Cursor DB extraction. sql.js (bundled) handles Cursor logs out of
 * the box; this command is purely a speed upgrade for large databases.
 *
 * We invoke npm in a child process and inherit stdio so the user sees
 * compile / download progress in real time. Install target is the user's
 * global npm prefix, which `npx token-rats sync` later resolves via the
 * normal node_modules lookup chain.
 */

import { spawn } from "node:child_process";

export interface InstallCursorOptions {
  /** Override the package manager binary (default: "npm"). */
  packageManager?: string;
}

export async function installCursorCommand(opts: InstallCursorOptions = {}): Promise<void> {
  const pm = opts.packageManager ?? "npm";

  console.log("\x1b[1mtoken-rats install-cursor\x1b[0m");
  console.log(
    "Installs better-sqlite3 globally for faster Cursor extraction.\n" +
      "You don't need this for Cursor support to work — sql.js (already\n" +
      "bundled) handles it. This is purely a speed upgrade for large DBs.\n",
  );

  const args = ["install", "-g", "better-sqlite3@^9.4.3"];
  console.log(`\x1b[2m$ ${pm} ${args.join(" ")}\x1b[0m\n`);

  const exitCode = await new Promise<number>((resolve) => {
    const child = spawn(pm, args, { stdio: "inherit" });
    child.on("close", (code) => resolve(code ?? 1));
    child.on("error", (err) => {
      console.error(`\x1b[31mFailed to launch ${pm}: ${err.message}\x1b[0m`);
      resolve(1);
    });
  });

  if (exitCode === 0) {
    console.log(
      "\n\x1b[32m✓\x1b[0m Done. Future `token-rats sync` runs will prefer better-sqlite3.",
    );
    return;
  }

  console.error(
    `\n\x1b[31mInstall failed (exit ${exitCode}). Cursor still works via sql.js — no action required.\x1b[0m`,
  );
  process.exit(exitCode);
}
