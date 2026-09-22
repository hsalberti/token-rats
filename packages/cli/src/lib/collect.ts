import { createHash } from "node:crypto";
import * as fs from "node:fs";
import type { SessionRecord } from "@token-rats/contracts";
import { parseClaudeCode, parseCodex, parseCursor } from "@token-rats/parsers";
import { discoverWorkspaceDbs, extractCursorGenerations } from "./cursor-extract.js";
import { discoverClaudeCodeFiles, discoverCodexFiles } from "./discover.js";

/** Parse a complete snapshot. Joining Claude logs deduplicates shared message IDs. */
export async function collectSessions(): Promise<SessionRecord[]> {
  function read(files: string[]): string {
    return files.map((file) => fs.readFileSync(file, "utf8")).join("\n");
  }
  const claude = parseClaudeCode(read(discoverClaudeCodeFiles()));
  const codex = parseCodex(read(discoverCodexFiles()));
  const { rows } = await extractCursorGenerations();
  const cursor = parseCursor(JSON.stringify(rows));
  return [...claude, ...codex, ...cursor].map((record) => ({
    ...record,
    accountingVersion: 2,
    dedupeKey: createHash("sha256")
      .update(
        JSON.stringify([
          record.id,
          record.source,
          record.model,
          record.startedAt,
          record.inTokens,
          record.outTokens,
          record.cacheReadTokens ?? 0,
          record.cacheWriteTokens ?? 0,
          record.reasoningTokens ?? 0,
        ]),
      )
      .digest("hex"),
  }));
}

/** Keep failed uploads pending. An acknowledgement belongs to the complete record. */
export class SyncQueue {
  private acknowledged = new Map<string, string>();

  async flush(records: SessionRecord[], upload: (batch: SessionRecord[]) => Promise<unknown>) {
    const fresh = records.filter((r) => this.acknowledged.get(r.id) !== JSON.stringify(r));
    for (let i = 0; i < fresh.length; i += 90) {
      const batch = fresh.slice(i, i + 90);
      await upload(batch);
      for (const record of batch) this.acknowledged.set(record.id, JSON.stringify(record));
    }
    return fresh.length;
  }
}

/** Avoid parsing unchanged history while keeping full-snapshot retry semantics. */
export function createCollector() {
  let signature = "";
  let records: SessionRecord[] = [];
  return async () => {
    const files = [
      ...discoverClaudeCodeFiles(),
      ...discoverCodexFiles(),
      ...discoverWorkspaceDbs().flatMap((file) => [file, `${file}-wal`]),
    ].sort();
    const next = JSON.stringify(
      files.map((file) => {
        try {
          const stat = fs.statSync(file);
          return [file, stat.size, stat.mtimeMs];
        } catch {
          return [file, null];
        }
      }),
    );
    if (next !== signature) {
      records = await collectSessions();
      signature = next;
    }
    return records;
  };
}
