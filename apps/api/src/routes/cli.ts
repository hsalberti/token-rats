/**
 * CLI version surface — drives the "upgrade" banner + sync chip in the web UI.
 *
 *   GET /v1/cli/version  — returns { latest, minSupported, upgradeCommand }
 *
 * The version constants live in worker env (`LATEST_CLI_VERSION` /
 * `MIN_SUPPORTED_CLI_VERSION`) so we can hotpatch without redeploying the web
 * app. Defaults are conservative — when unset, the endpoint claims the
 * currently-shipped CLI is latest, so nothing flips to "outdated" until we
 * deliberately bump.
 */

import { Hono } from "hono";
import type { Env } from "../env.js";

type HonoEnv = { Bindings: Env };

const cli = new Hono<HonoEnv>();

cli.get("/version", (c) => {
  const latest = c.env.LATEST_CLI_VERSION ?? "0.1.0";
  const minSupported = c.env.MIN_SUPPORTED_CLI_VERSION ?? "0.1.0";
  return c.json({
    latest,
    minSupported,
    upgradeCommand: "npm i -g token-rats@latest",
  });
});

export default cli;
