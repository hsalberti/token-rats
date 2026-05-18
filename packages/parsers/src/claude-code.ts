import type { SessionRecord } from "@token-rats/contracts";

/**
 * Phase 0 stub. Phase 1 / Track A replaces this with a real JSONL parser for
 * Claude Code logs at `~/.claude/projects/**\/*.jsonl`.
 */
export function parseClaudeCode(_input: string | ArrayBuffer | Uint8Array): SessionRecord[] {
  return [];
}
