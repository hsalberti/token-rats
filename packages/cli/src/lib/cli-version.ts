import manifest from "../../package.json" with { type: "json" };

/** Bundled from the package manifest; also sent in X-Cli-Version. */
export const CLI_VERSION = manifest.version;
