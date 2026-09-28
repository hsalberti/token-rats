/** Read usage fields from OpenCode's local SQLite database. Message text never leaves SQLite. */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import type { Provider, SessionRecord } from "@token-rats/contracts";

type SqliteModule = typeof import("node:sqlite");
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as SqliteModule;

interface UsageRow {
  sessionId: string;
  model: string | null;
  provider: string | null;
  startedAt: number;
  endedAt: number;
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
}

const usageSql = `WITH usage AS (
  SELECT
    id AS messageId,
    session_id AS sessionId,
    time_created AS createdAt,
    time_updated AS updatedAt,
    json_extract(data, '$.modelID') AS model,
    json_extract(data, '$.providerID') AS provider,
    json_extract(data, '$.agent') AS agent,
    json_extract(data, '$.cost') AS cost,
    COALESCE(json_extract(data, '$.tokens.input'), 0) AS input,
    COALESCE(json_extract(data, '$.tokens.output'), 0) AS output,
    COALESCE(json_extract(data, '$.tokens.reasoning'), 0) AS reasoning,
    COALESCE(json_extract(data, '$.tokens.cache.read'), 0) AS cacheRead,
    COALESCE(json_extract(data, '$.tokens.cache.write'), 0) AS cacheWrite
  FROM message
  WHERE json_extract(data, '$.role') = 'assistant'
    AND json_type(data, '$.tokens') = 'object'
), deduplicated AS (
  SELECT *, ROW_NUMBER() OVER (
    PARTITION BY createdAt, model, provider, agent, cost,
      input, output, reasoning, cacheRead, cacheWrite
    ORDER BY sessionId, messageId
  ) AS copyRank
  FROM usage
)
SELECT
  sessionId, model, provider,
  MIN(createdAt) AS startedAt,
  MAX(updatedAt) AS endedAt,
  SUM(input) AS input,
  SUM(output) AS output,
  SUM(reasoning) AS reasoning,
  SUM(cacheRead) AS cacheRead,
  SUM(cacheWrite) AS cacheWrite
FROM deduplicated
WHERE copyRank = 1
GROUP BY sessionId, model, provider`;

/** OpenCode uses XDG data directories on every platform; OPENCODE_DB overrides the DB path. */
export function discoverOpenCodeDbs(): string[] {
  const home = homedir();
  const dataRoot =
    process.env.OPENCODE_DATA_DIR ??
    join(process.env.XDG_DATA_HOME ?? join(home, ".local", "share"), "opencode");
  const paths: string[] = [];
  if (process.env.OPENCODE_DB) {
    const custom = process.env.OPENCODE_DB;
    paths.push(isAbsolute(custom) ? custom : resolve(custom));
  }
  if (existsSync(dataRoot)) {
    for (const name of readdirSync(dataRoot)) {
      if (/^opencode(?:-[A-Za-z0-9_-]+)?\.db$/.test(name)) paths.push(join(dataRoot, name));
    }
  }
  const seen = new Set<string>();
  return paths.filter((file) => {
    if (!existsSync(file)) return false;
    const real = realpathSync(file);
    if (seen.has(real)) return false;
    seen.add(real);
    return true;
  });
}

function checkedCount(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("OpenCode database has an invalid token count");
  }
  return value;
}

function providerOf(id: string | null): Provider {
  if (id === "anthropic") return "anthropic";
  if (id === "openai") return "openai";
  if (id === "openrouter") return "openrouter";
  if (id === "ollama") return "ollama";
  return "unknown";
}

export function readOpenCodeDb(file: string): SessionRecord[] {
  const db = new DatabaseSync(file, { readOnly: true } as unknown as ConstructorParameters<
    typeof DatabaseSync
  >[1]);
  try {
    const rows = db.prepare(usageSql).all() as unknown as UsageRow[];
    return rows.flatMap((row) => {
      const input = checkedCount(row.input);
      const output = checkedCount(row.output);
      const reasoning = checkedCount(row.reasoning);
      const cacheRead = checkedCount(row.cacheRead);
      const cacheWrite = checkedCount(row.cacheWrite);
      const outTokens = checkedCount(output + reasoning);
      if (input + outTokens + cacheRead + cacheWrite === 0) return [];
      if (
        !row.sessionId ||
        !Number.isSafeInteger(row.startedAt) ||
        row.startedAt <= 0 ||
        !Number.isSafeInteger(row.endedAt) ||
        row.endedAt < row.startedAt
      ) {
        throw new Error("OpenCode database has an invalid session timestamp");
      }
      const model = row.model || "unknown";
      if (model.length > 128) throw new Error("OpenCode model identifier exceeds 128 characters");
      const identity = JSON.stringify([row.sessionId, row.provider, model]);
      const id = `opencode:${createHash("sha256").update(identity).digest("hex")}`;
      return [
        {
          id,
          source: "opencode" as const,
          provider: providerOf(row.provider),
          client: "opencode",
          channel: "cli" as const,
          model,
          inTokens: input,
          outTokens,
          reasoningTokens: reasoning,
          cacheReadTokens: cacheRead,
          cacheWriteTokens: cacheWrite,
          costUsdCents: 0,
          startedAt: row.startedAt,
          endedAt: row.endedAt,
          dedupeKey: id,
        },
      ];
    });
  } finally {
    db.close();
  }
}

export function collectOpenCodeSessions(): SessionRecord[] {
  const records = new Map<string, SessionRecord>();
  for (const file of discoverOpenCodeDbs()) {
    for (const record of readOpenCodeDb(file)) {
      const previous = records.get(record.id);
      if (
        !previous ||
        record.endedAt > previous.endedAt ||
        (record.endedAt === previous.endedAt &&
          record.inTokens + record.outTokens > previous.inTokens + previous.outTokens)
      ) {
        records.set(record.id, record);
      }
    }
  }
  return [...records.values()];
}
