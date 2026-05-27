import { z } from "zod";

/**
 * Response shape for `GET /v1/cli/version` — used by the web UI to surface
 * "new CLI available" banners and to drive the in-nav sync-status chip.
 *
 * `latest` is the published `token-rats` npm version we want everyone on.
 * `minSupported` lets us mark older installs as unsupported (currently the
 * banner just says "upgrade"; in a later cut we can promote critical bumps).
 */
export const CliVersionResponse = z.object({
  latest: z.string().min(1),
  minSupported: z.string().min(1),
  upgradeCommand: z.string().min(1),
});
export type CliVersionResponse = z.infer<typeof CliVersionResponse>;
