/**
 * Extracts Cursor AI request rows from the Cursor sqlite cache.
 *
 * Driver chain, in order — first one that succeeds wins:
 *   1. `node:sqlite`     (built into Node ≥22.5, zero install cost)
 *   2. `sql.js`          (WebAssembly SQLite, bundled in the published CLI)
 *   3. `better-sqlite3`  (native C++ addon, opt-in via `token-rats install-cursor`)
 *
 * sql.js is the lean default: pure JS install, no compile step, works on any
 * Node version we support. better-sqlite3 is roughly 5-10× faster on large
 * Cursor DBs but requires a platform-specific native build, so it's gated
 * behind an explicit install step.
 *
 * Output rows match the shape parseCursor() expects:
 *   { id, model, promptTokens, completionTokens, startedAt, endedAt }
 */

import { readFile } from "node:fs/promises";

export interface CursorRow {
  id: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  startedAt: number;
  endedAt: number;
}

type DbInstance = {
  prepare: (sql: string) => { all: () => unknown[] };
  close: () => void;
};

type DbFactory = () => DbInstance;

/** Attempt to read rows from the Cursor DB using node:sqlite (Node ≥22). */
async function tryNodeSqlite(dbPath: string): Promise<CursorRow[] | null> {
  // node:sqlite is experimental in Node 22; use a dynamic import so TypeScript
  // compiles fine on older @types/node versions that lack the module.
  let DatabaseConstructor: new (
    path: string,
    opts?: Record<string, unknown>,
  ) => DbInstance;

  try {
    const mod = await import("node:sqlite");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    DatabaseConstructor = (mod as any).DatabaseSync;
    if (!DatabaseConstructor) return null;
  } catch {
    return null;
  }

  return readWithDb(() => new DatabaseConstructor(dbPath, { readOnly: true }));
}

/** Attempt to read rows from the Cursor DB using sql.js (pure-WASM SQLite). */
async function trySqlJs(dbPath: string): Promise<CursorRow[] | null> {
  let initSqlJs: (config?: Record<string, unknown>) => Promise<{
    Database: new (data?: Uint8Array) => {
      exec: (sql: string) => Array<{ columns: string[]; values: unknown[][] }>;
      close: () => void;
    };
  }>;

  try {
    const mod = await import("sql.js");
    // sql.js's CJS default export is the init function.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    initSqlJs = ((mod as any).default ?? mod) as typeof initSqlJs;
  } catch {
    return null;
  }

  let SQL: Awaited<ReturnType<typeof initSqlJs>>;
  let fileBytes: Buffer;
  try {
    SQL = await initSqlJs();
    fileBytes = await readFile(dbPath);
  } catch {
    return null;
  }

  // Wrap sql.js's exec()-based API to match the DbInstance shape used by readWithDb.
  const sqlDb = new SQL.Database(new Uint8Array(fileBytes));
  const adapter: DbInstance = {
    prepare: (sql: string) => ({
      all: () => {
        const results = sqlDb.exec(sql);
        if (results.length === 0) return [];
        const { columns, values } = results[0]!;
        return values.map((row) => {
          const obj: Record<string, unknown> = {};
          for (let i = 0; i < columns.length; i++) {
            obj[columns[i]!] = row[i];
          }
          return obj;
        });
      },
    }),
    close: () => sqlDb.close(),
  };
  return readWithDb(() => adapter);
}

/** Attempt to read rows from the Cursor DB using better-sqlite3. */
async function tryBetterSqlite3(dbPath: string): Promise<CursorRow[] | null> {
  let Database: new (
    path: string,
    opts?: Record<string, unknown>,
  ) => DbInstance;

  try {
    const mod = await import("better-sqlite3");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Database = (mod as any).default ?? (mod as any);
  } catch {
    return null;
  }

  return readWithDb(() => new Database(dbPath, { readonly: true, fileMustExist: true }));
}

function readWithDb(factory: DbFactory): CursorRow[] | null {
  let db: DbInstance | null = null;
  try {
    db = factory();
    const rows = tryItemTable(db) ?? tryDirectTable(db) ?? [];
    return rows;
  } catch {
    return null;
  } finally {
    try {
      db?.close();
    } catch {
      // ignore
    }
  }
}

/** Try to read from Cursor's ItemTable (primary known schema). */
function tryItemTable(db: DbInstance): CursorRow[] | null {
  try {
    const stmt = db.prepare("SELECT value FROM ItemTable WHERE key = 'aiRequests'");
    const rows = stmt.all() as Array<{ value: string }>;
    if (rows.length === 0) return null;

    const raw = rows[0]?.value;
    if (typeof raw !== "string") return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }

    if (!Array.isArray(parsed)) return null;
    return normalizeRows(parsed);
  } catch {
    return null;
  }
}

/** Try to read from a direct requests table (alternative schema). */
function tryDirectTable(db: DbInstance): CursorRow[] | null {
  try {
    const stmt = db.prepare(
      `SELECT id, model,
              prompt_tokens as promptTokens, completion_tokens as completionTokens,
              started_at as startedAt, ended_at as endedAt
       FROM cursor_requests
       ORDER BY started_at DESC
       LIMIT 50000`,
    );
    const rows = stmt.all() as unknown[];
    return normalizeRows(rows);
  } catch {
    return null;
  }
}

/** Normalise raw JSON rows into typed CursorRow objects, skipping invalids. */
function normalizeRows(rows: unknown[]): CursorRow[] {
  const results: CursorRow[] = [];
  for (const raw of rows) {
    if (typeof raw !== "object" || raw === null) continue;
    const r = raw as Record<string, unknown>;

    const id = typeof r["id"] === "string" ? r["id"] : null;
    if (!id) continue;

    const model = typeof r["model"] === "string" ? r["model"] : "unknown";
    const promptTokens = toNonNegInt(r["promptTokens"] ?? r["prompt_tokens"]);
    const completionTokens = toNonNegInt(r["completionTokens"] ?? r["completion_tokens"]);
    const startedAt = toPositiveMs(r["startedAt"] ?? r["started_at"]);
    const endedAt = toPositiveMs(r["endedAt"] ?? r["ended_at"]);

    if (startedAt === null || endedAt === null) continue;

    results.push({ id, model, promptTokens, completionTokens, startedAt, endedAt });
  }
  return results;
}

function toNonNegInt(v: unknown): number {
  if (typeof v !== "number" || !isFinite(v)) return 0;
  return Math.max(0, Math.floor(v));
}

function toPositiveMs(v: unknown): number | null {
  if (typeof v !== "number" || !isFinite(v) || v <= 0) return null;
  return v;
}

/**
 * Extract CursorRow[] from a sqlite DB file.
 * Returns an empty array + reason string if the DB cannot be read.
 */
export async function readCursorDb(
  dbPath: string,
): Promise<{ rows: CursorRow[]; skipped: string | null }> {
  // 1. node:sqlite — built into Node ≥22.5, fastest path with zero install cost.
  const fromNodeSqlite = await tryNodeSqlite(dbPath);
  if (fromNodeSqlite !== null) {
    return { rows: fromNodeSqlite, skipped: null };
  }

  // 2. sql.js — WebAssembly SQLite, bundled with the published CLI.
  //    This is the default path on Node <22.5.
  const fromSqlJs = await trySqlJs(dbPath);
  if (fromSqlJs !== null) {
    return { rows: fromSqlJs, skipped: null };
  }

  // 3. better-sqlite3 — native C++ addon, only present if the user explicitly
  //    installed it via `token-rats install-cursor`. Faster than sql.js on
  //    very large Cursor DBs.
  const fromBetter = await tryBetterSqlite3(dbPath);
  if (fromBetter !== null) {
    return { rows: fromBetter, skipped: null };
  }

  return {
    rows: [],
    skipped:
      "Could not open Cursor DB (sqlite drivers unavailable). " +
      "Run `npx token-rats install-cursor` for native speed, or upgrade to Node ≥22.5.",
  };
}
