import type { SessionRecord, Source } from "@token-rats/contracts";

export type { SessionRecord, Source };

/**
 * Parsers are pure functions over the contents of a single log/cache source.
 * Track A (Phase 1) provides the concrete implementations; Phase 0 ships only
 * the signature so the CLI and tests can compile.
 */
export type Parser = (input: string | ArrayBuffer | Uint8Array) => SessionRecord[];

export { parseClaudeCode } from "./claude-code.js";
export { parseCodex } from "./codex.js";
export { parseCursor } from "./cursor.js";
export { computeDedupeKey, fnv1aHex } from "./hash.js";
