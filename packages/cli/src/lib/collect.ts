import { createHash } from "node:crypto";
import * as fs from "node:fs";
import { createInterface } from "node:readline";
import type { SessionRecord } from "@token-rats/contracts";
import { createClaudeCodeParser, createCodexParser, parseCursor } from "@token-rats/parsers";
import { discoverWorkspaceDbs, extractCursorGenerations } from "./cursor-extract.js";
import { discoverClaudeCodeFiles, discoverCodexFiles } from "./discover.js";

/** Keep one accumulator across files so copied messages and rollouts deduplicate. */
export async function parseSessionFiles(
  files: string[],
  parser: { push(line: string): void; finish(): SessionRecord[]; startFile?(): void },
): Promise<SessionRecord[]> {
  for (const file of files) {
    parser.startFile?.();
    const input = fs.createReadStream(file, { encoding: "utf8" });
    const lines = createInterface({ input, crlfDelay: Number.POSITIVE_INFINITY });
    try {
      for await (const line of lines) parser.push(line);
    } finally {
      lines.close();
      input.destroy();
    }
  }
  return parser.finish();
}

/** Parse a complete snapshot without loading the full log history into memory. */
export async function collectSessions(): Promise<SessionRecord[]> {
  const claude = await parseSessionFiles(discoverClaudeCodeFiles(), createClaudeCodeParser());
  const codex = await parseSessionFiles(discoverCodexFiles(), createCodexParser());
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
