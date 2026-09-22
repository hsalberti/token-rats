import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import Database from "better-sqlite3";
import type { Env } from "../env.js";

/** Real SQLite with production migrations and the D1 methods used by tests. */
export function testDatabase(): { db: Database.Database; env: Env } {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  const migrations = resolve(import.meta.dirname, "../../../../infra/migrations");
  for (const file of readdirSync(migrations)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    db.exec(readFileSync(resolve(migrations, file), "utf8"));
  }
  function prepare(sql: string) {
    let args: unknown[] = [];
    const stmt = {
      bind(...values: unknown[]) {
        args = values;
        return stmt;
      },
      async first() {
        return db.prepare(sql).get(...args) ?? null;
      },
      async all() {
        return { results: db.prepare(sql).all(...args) };
      },
      async run() {
        return stmt.execute();
      },
      execute() {
        return { meta: { changes: db.prepare(sql).run(...args).changes } };
      },
    };
    return stmt;
  }
  const cache = new Map<string, string>();
  const env = {
    DB: {
      prepare,
      async batch(statements: ReturnType<typeof prepare>[]) {
        return db.transaction(() => statements.map((s) => s.execute()))();
      },
    },
    CACHE: {
      async get(key: string, kind?: string) {
        const value = cache.get(key);
        return value === undefined ? null : kind === "json" ? JSON.parse(value) : value;
      },
      async put(key: string, value: string) {
        cache.set(key, value);
      },
    },
    SESSION_SIGNING_KEY: "test-only-signing-key",
    ADMIN_GITHUB_LOGIN: "moderator",
  } as unknown as Env;
  for (const [index, handle] of ["alice", "bob", "moderator"].entries()) {
    db.prepare("INSERT INTO users (id, github_id, handle, created_at) VALUES (?, ?, ?, ?)").run(
      handle,
      index + 1,
      handle,
      Date.now(),
    );
  }
  return { db, env };
}
