/**
 * Extracts Cursor AI request rows from the Cursor sqlite cache.
 *
 * Uses node:sqlite (Node ≥22) if available, with a fallback to
 * better-sqlite3 (optional dependency). If neither is present,
 * returns an empty array with a friendly warning.
 *
 * Output rows match the shape parseCursor() expects:
 *   { id, model, promptTokens, completionTokens, startedAt, endedAt }
 */

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
  // Try node:sqlite first (no native addon, available in Node ≥22)
  const fromNodeSqlite = await tryNodeSqlite(dbPath);
  if (fromNodeSqlite !== null) {
    return { rows: fromNodeSqlite, skipped: null };
  }

  // Fall back to better-sqlite3
  const fromBetter = await tryBetterSqlite3(dbPath);
  if (fromBetter !== null) {
    return { rows: fromBetter, skipped: null };
  }

  return {
    rows: [],
    skipped: "Could not open Cursor DB (no sqlite driver available). Skipping Cursor source.",
  };
}
