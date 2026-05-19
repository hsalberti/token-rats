/**
 * Extracts Cursor AI generation events from the per-workspace SQLite caches.
 *
 * Cursor stores AI activity per-workspace under the key `aiService.generations`
 * in each `workspaceStorage/*\/state.vscdb`. The legacy global key `aiRequests`
 * doesn't exist in current Cursor builds. **Crucially, Cursor does not store
 * token counts on disk** — only `{ unixMs, generationUUID, type, textDescription }`.
 * We drop `textDescription` on read (mission.md privacy rule); the parser
 * estimates tokens from the request type.
 *
 * Driver chain — first one that succeeds wins:
 *   1. `node:sqlite`     (built into Node ≥22.5, zero install cost)
 *   2. `sql.js`          (WebAssembly SQLite, bundled in the published CLI)
 *   3. `better-sqlite3`  (native C++ addon, opt-in via `token-rats install-cursor`)
 *
 * Output rows match the shape parseCursor() now expects:
 *   { id, type, unixMs }
 */

import { existsSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/** Minimal row exported per Cursor generation event. */
export interface CursorRow {
  /** Cursor's generationUUID — used as the dedup key. */
  id: string;
  /** "composer" | "tab" | other Cursor-internal type. */
  type: string;
  /** Event timestamp (ms epoch). */
  unixMs: number;
}

/** Generic SQLite-driver shape used by readAllGenerations. */
type DbInstance = {
  exec: (sql: string) => Array<{ columns: string[]; values: unknown[][] }>;
  close: () => void;
};

/** Returns the directory containing per-workspace state.vscdb files. */
export function cursorWorkspaceStorageDir(): string {
  const home = homedir();
  const rel = join("Cursor", "User", "workspaceStorage");
  if (process.platform === "darwin") {
    return join(home, "Library", "Application Support", rel);
  }
  if (process.platform === "win32") {
    const appData = process.env["APPDATA"] ?? join(home, "AppData", "Roaming");
    return join(appData, rel);
  }
  const xdgConfig = process.env["XDG_CONFIG_HOME"] ?? join(home, ".config");
  return join(xdgConfig, rel);
}

/** Lists every state.vscdb file under the workspace storage dir. */
function discoverWorkspaceDbs(): string[] {
  const root = cursorWorkspaceStorageDir();
  if (!existsSync(root)) return [];

  const out: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = join(root, entry.name, "state.vscdb");
    if (existsSync(candidate)) out.push(candidate);
  }
  return out;
}

/** Open a Cursor DB with the first driver that works. Returns null if none do. */
async function openDb(dbPath: string): Promise<DbInstance | null> {
  // 1. node:sqlite (Node ≥22.5)
  try {
    const mod = await import("node:sqlite");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const DatabaseSync = (mod as any).DatabaseSync;
    if (DatabaseSync) {
      const db = new DatabaseSync(dbPath, { readOnly: true });
      // node:sqlite uses prepare/all rather than exec(). Wrap to match.
      return {
        exec: (sql: string) => {
          const stmt = db.prepare(sql);
          const rows = stmt.all() as Array<Record<string, unknown>>;
          if (rows.length === 0) return [];
          const columns = Object.keys(rows[0]!);
          return [
            {
              columns,
              values: rows.map((r) => columns.map((c) => r[c])),
            },
          ];
        },
        close: () => db.close(),
      };
    }
  } catch {
    // fall through
  }

  // 2. sql.js (bundled WASM)
  try {
    const sqlJs = await import("sql.js");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const initSqlJs = ((sqlJs as any).default ?? sqlJs) as (
      cfg?: Record<string, unknown>,
    ) => Promise<{
      Database: new (data?: Uint8Array) => DbInstance;
    }>;
    const SQL = await initSqlJs();
    const bytes = await readFile(dbPath);
    return new SQL.Database(new Uint8Array(bytes));
  } catch {
    // fall through
  }

  // 3. better-sqlite3 (opt-in)
  try {
    const mod = await import("better-sqlite3");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Database = (mod as any).default ?? mod;
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    return {
      exec: (sql: string) => {
        const stmt = db.prepare(sql);
        const rows = stmt.all() as Array<Record<string, unknown>>;
        if (rows.length === 0) return [];
        const columns = Object.keys(rows[0]!);
        return [
          {
            columns,
            values: rows.map((r) => columns.map((c) => r[c])),
          },
        ];
      },
      close: () => db.close(),
    };
  } catch {
    return null;
  }
}

/** Pull aiService.generations rows from a single workspace DB. */
async function readGenerationsFromDb(dbPath: string): Promise<CursorRow[]> {
  const db = await openDb(dbPath);
  if (!db) return [];

  try {
    const res = db.exec(`SELECT value FROM ItemTable WHERE key = 'aiService.generations'`);
    if (res.length === 0 || res[0]!.values.length === 0) return [];

    const raw = res[0]!.values[0]![0];
    if (typeof raw !== "string") return [];

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
    if (!Array.isArray(parsed)) return [];

    const out: CursorRow[] = [];
    for (const item of parsed) {
      if (typeof item !== "object" || item === null) continue;
      const r = item as Record<string, unknown>;
      const id = typeof r["generationUUID"] === "string" ? r["generationUUID"] : null;
      const type = typeof r["type"] === "string" ? r["type"] : null;
      const unixMs =
        typeof r["unixMs"] === "number" && isFinite(r["unixMs"]) && r["unixMs"] > 0
          ? r["unixMs"]
          : null;
      // Deliberately ignore `textDescription` — that's prompt content.
      if (!id || !type || unixMs === null) continue;
      out.push({ id, type, unixMs });
    }
    return out;
  } catch {
    return [];
  } finally {
    try {
      db.close();
    } catch {
      // ignore
    }
  }
}

/**
 * Discover every workspace DB, read `aiService.generations` from each, and
 * return a deduped flat list (one row per unique generationUUID).
 */
export async function extractCursorGenerations(): Promise<{
  rows: CursorRow[];
  skipped: string | null;
  dbCount: number;
}> {
  const dbPaths = discoverWorkspaceDbs();
  if (dbPaths.length === 0) {
    return {
      rows: [],
      skipped: null,
      dbCount: 0,
    };
  }

  const seen = new Set<string>();
  const rows: CursorRow[] = [];

  let openFailures = 0;
  for (const p of dbPaths) {
    let perDb: CursorRow[] = [];
    try {
      perDb = await readGenerationsFromDb(p);
    } catch {
      openFailures++;
      continue;
    }
    for (const r of perDb) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      rows.push(r);
    }
  }

  // If every DB failed to open, surface a friendly hint.
  if (rows.length === 0 && openFailures === dbPaths.length) {
    return {
      rows: [],
      dbCount: dbPaths.length,
      skipped:
        "Could not open any Cursor workspace DB (sqlite drivers unavailable). " +
        "Run `npx token-rats install-cursor` for native speed, or upgrade to Node ≥22.5.",
    };
  }

  return { rows, dbCount: dbPaths.length, skipped: null };
}
