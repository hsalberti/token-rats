import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionRecord } from "@token-rats/contracts";
import { afterEach, describe, expect, it } from "vitest";
import { collectOpenCodeSessions, readOpenCodeDb } from "../lib/opencode-extract.js";

type SqliteModule = typeof import("node:sqlite");
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as SqliteModule;

const directories: string[] = [];
const oldDataDir = process.env.OPENCODE_DATA_DIR;
const oldDb = process.env.OPENCODE_DB;
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
  if (oldDataDir === undefined) Reflect.deleteProperty(process.env, "OPENCODE_DATA_DIR");
  else process.env.OPENCODE_DATA_DIR = oldDataDir;
  if (oldDb === undefined) Reflect.deleteProperty(process.env, "OPENCODE_DB");
  else process.env.OPENCODE_DB = oldDb;
});

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "token-rats-opencode-"));
  directories.push(dir);
  const file = join(dir, "opencode.db");
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT, time_created INTEGER,
      time_updated INTEGER, data TEXT NOT NULL);`);
  const insert = db.prepare("INSERT INTO message VALUES (?, ?, ?, ?, ?)");
  const message = (id: string, session: string, time: number, data: unknown) =>
    insert.run(id, session, time, time + 100, JSON.stringify(data));
  return { dir, file, db, message };
}

describe("OpenCode local collection", () => {
  it("reads current WAL data and keeps each model's usage separate", () => {
    const { file, db, message } = fixture();
    message("user", "s1", 1000, { role: "user", content: "private prompt" });
    message("a", "s1", 2000, {
      role: "assistant",
      modelID: "model-a",
      providerID: "anthropic",
      content: "private completion",
      tokens: { input: 10, output: 3, reasoning: 2, cache: { read: 40, write: 5 } },
    });
    message("b", "s1", 3000, {
      role: "assistant",
      modelID: "model-a",
      providerID: "anthropic",
      tokens: { input: 4, output: 1, reasoning: 0, cache: { read: 20, write: 0 } },
    });
    message("c", "s1", 4000, {
      role: "assistant",
      modelID: "model-b",
      providerID: "deepseek",
      tokens: { input: 7, output: 6, reasoning: 1, cache: { read: 0, write: 0 } },
    });
    const records = readOpenCodeDb(file);
    expect(records).toHaveLength(2);
    expect(records.find((r) => r.model === "model-a")).toMatchObject({
      source: "opencode",
      provider: "anthropic",
      client: "opencode",
      channel: "cli",
      inTokens: 14,
      outTokens: 6,
      reasoningTokens: 2,
      cacheReadTokens: 60,
      cacheWriteTokens: 5,
      startedAt: 2000,
      endedAt: 3100,
    });
    expect(records.find((r) => r.model === "model-b")).toMatchObject({
      provider: "unknown",
      inTokens: 7,
      outTokens: 7,
      reasoningTokens: 1,
    });
    expect(records.every((r) => SessionRecord.safeParse(r).success)).toBe(true);
    expect(JSON.stringify(records)).not.toContain("private");
    db.close();
  });

  it("discovers the XDG database and ignores zero-usage messages", () => {
    const { dir, db, message } = fixture();
    process.env.OPENCODE_DATA_DIR = dir;
    Reflect.deleteProperty(process.env, "OPENCODE_DB");
    message("zero", "s1", 1000, {
      role: "assistant",
      modelID: "model-a",
      providerID: "openai",
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    });
    expect(collectOpenCodeSessions()).toEqual([]);
    db.close();
  });

  it("counts copied fork history once and keeps new fork usage", () => {
    const { file, db, message } = fixture();
    const oldUsage = {
      role: "assistant",
      modelID: "model-a",
      providerID: "anthropic",
      agent: "build",
      cost: 0.02,
      tokens: { input: 10, output: 3, reasoning: 2, cache: { read: 40, write: 5 } },
    };
    message("original", "s1", 1000, oldUsage);
    message("fork-copy", "s2", 1000, oldUsage);
    message("fork-new", "s2", 2000, {
      ...oldUsage,
      tokens: { input: 7, output: 4, reasoning: 1, cache: { read: 0, write: 0 } },
    });
    const records = readOpenCodeDb(file);
    expect(records).toHaveLength(2);
    expect(records.reduce((total, row) => total + row.inTokens, 0)).toBe(17);
    expect(records.reduce((total, row) => total + row.outTokens, 0)).toBe(10);
    expect(records.reduce((total, row) => total + (row.cacheReadTokens ?? 0), 0)).toBe(40);
    db.close();
  });
});
