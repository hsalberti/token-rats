#!/usr/bin/env node
/**
 * Build script: bundles the CLI into a single dist/index.js using esbuild.
 *
 * - Bundles all workspace dependencies (contracts, parsers, pricing) so the
 *   published artifact has no workspace:* imports.
 * - Marks optional and external runtime deps (better-sqlite3, open, clipboardy,
 *   node:* builtins) as external so they resolve at runtime.
 * - Preserves the #!/usr/bin/env node shebang and sets chmod +x.
 */

import { build } from "esbuild";
import { chmodSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const entryPoint = resolve(__dirname, "src/index.ts");
const outfile = resolve(__dirname, "dist/index.js");

mkdirSync(resolve(__dirname, "dist"), { recursive: true });

await build({
  entryPoints: [entryPoint],
  bundle: true,
  outfile,
  platform: "node",
  target: "node20",
  format: "esm",
  // Keep runtime deps and built-ins external
  external: [
    "better-sqlite3",
    "clipboardy",
    "open",
    "node:*",
    // Native node modules
    "crypto",
    "fs",
    "os",
    "path",
    "child_process",
    "util",
    "http",
    "https",
    "url",
    "events",
    "stream",
    "buffer",
  ],
  logLevel: "info",
  sourcemap: false,
});

// Make the output executable
chmodSync(outfile, 0o755);

console.log("Built dist/index.js");
