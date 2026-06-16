/**
 * Worker build version. Surfaced by `GET /healthz` so external monitors can
 * correlate a probe with a specific deploy. Bumped manually alongside notable
 * Worker changes — kept independent of the CLI's npm version.
 */
export const WORKER_VERSION = "1.0.0";
