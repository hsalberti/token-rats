import type { SessionRecord } from "@token-rats/contracts";

/**
 * Phase 0 stub. Phase 1 / Track A replaces this with a real Cursor parser
 * (reads the sqlite cache exported as a buffer by the CLI).
 */
export function parseCursor(_input: string | ArrayBuffer | Uint8Array): SessionRecord[] {
  return [];
}
