/**
 * Extract AI usage rows from the Cursor sqlite state.vscdb.
 *
 * We use better-sqlite3 declared as an optionalDependency. If it's not
 * installed (or its native binary is missing on this platform) we catch the
 * import error and return an empty array with a friendly message.
 *
 * The Cursor cache stores AI request metadata in the `ItemTable` under a
 * known key namespace. We read any entries whose key starts with
 * `aiService.requestRecords` and extract the JSON payload.
 */

import { log } from "./log.js";

export interface CursorRow {
  id: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  startedAt: number;
  endedAt: number;
}

interface BetterSqlite3Database {
  prepare: (sql: string) => { all: (...params: unknown[]) => unknown[] };
  close: () => void;
}

type BetterSqlite3Constructor = new (
  path: string,
  options?: { readonly?: boolean; fileMustExist?: boolean },
) => BetterSqlite3Database;

interface ItemRow {
  key: string;
  value: string;
}

/** Try to load better-sqlite3 dynamically. Returns null if unavailable. */
async function loadBetterSqlite3(): Promise<BetterSqlite3Constructor | null> {
  try {
    const mod = await import("better-sqlite3");
    return (mod.default ?? mod) as BetterSqlite3Constructor;
  } catch {
    return null;
  }
}

/** Parse a single JSON blob from the Cursor cache into CursorRow[]. */
function parseBlob(blob: string): CursorRow[] {
  try {
    const parsed: unknown = JSON.parse(blob);
    if (!Array.isArray(parsed)) return [];
    const results: CursorRow[] = [];
    for (const item of parsed) {
      if (
        item &&
        typeof item === "object" &&
        typeof (item as Record<string, unknown>)["requestId"] === "string"
      ) {
        const r = item as Record<string, unknown>;
        const row: CursorRow = {
          id: String(r["requestId"] ?? r["id"] ?? ""),
          model: String(r["modelType"] ?? r["model"] ?? "unknown"),
          promptTokens: Number(r["numPromptTokens"] ?? r["promptTokens"] ?? 0),
          completionTokens: Number(
            r["numCompletionTokens"] ?? r["completionTokens"] ?? 0,
          ),
          startedAt: Number(r["unixMs"] ?? r["startedAt"] ?? Date.now()),
          endedAt: Number(
            r["endUnixMs"] ?? r["endedAt"] ?? r["unixMs"] ?? Date.now(),
          ),
        };
        if (row.id) results.push(row);
      }
    }
    return results;
  } catch {
    return [];
  }
}

/**
 * Extract CursorRows from the vscdb sqlite file at `dbPath`.
 * Returns an empty array if better-sqlite3 is unavailable.
 */
export async function extractCursorRows(
  dbPath: string,
  verbose: boolean,
): Promise<CursorRow[]> {
  const Database = await loadBetterSqlite3();
  if (!Database) {
    log.warn(
      "Cursor source skipped: better-sqlite3 is not installed (optional). " +
        "Run `npm install -g better-sqlite3` if you want Cursor support.",
    );
    return [];
  }

  let db: BetterSqlite3Database | null = null;
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
    const stmt = db.prepare(
      `SELECT key, value FROM ItemTable WHERE key LIKE 'aiService.requestRecords%'`,
    );
    const rows = stmt.all() as ItemRow[];
    log.verbose(`Cursor: found ${rows.length} record blob(s) in ${dbPath}`, verbose);

    const all: CursorRow[] = [];
    for (const row of rows) {
      all.push(...parseBlob(row.value));
    }
    return all;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn(`Cursor sqlite read failed: ${msg}`);
    return [];
  } finally {
    db?.close();
  }
}
