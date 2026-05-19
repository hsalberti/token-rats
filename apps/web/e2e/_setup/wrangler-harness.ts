/**
 * Wrangler-dev + fresh D1 harness for per-spec setup.
 *
 * SCAFFOLD — see implementation-notes.md (Feature #8, "Wrangler harness gap").
 *
 * Goal API:
 *
 *   const harness = await startHarness({ migrations: "../../infra/migrations" });
 *   await harness.seed("default-user");
 *   // use harness.apiBaseUrl in the test
 *   await harness.stop();
 *
 * The full implementation needs to:
 *   1. Allocate a free TCP port for wrangler dev.
 *   2. Spawn `wrangler dev --local --persist-to <tmpdir>` against a fresh
 *      D1 file (point `[[d1_databases]]` to a per-spec sqlite path).
 *   3. Apply migrations via `wrangler d1 migrations apply` against the
 *      local file.
 *   4. Run seed SQL.
 *   5. Wait for the port to accept connections; expose `apiBaseUrl`.
 *   6. On `stop()`, kill the wrangler process and rm the tmpdir.
 *
 * The shape is here so individual specs can already `import` it; the
 * implementation can be filled in without changing call sites.
 */

export interface HarnessOptions {
  /** Path to the migrations directory, relative to apps/web/. */
  migrations?: string;
  /** Optional seed SQL applied after migrations. */
  seedSql?: string;
}

export interface Harness {
  apiBaseUrl: string;
  /** Run a one-shot SQL statement against the test D1 (for fixture writes). */
  exec(sql: string): Promise<void>;
  /** Tear down: kill wrangler, remove tmpdir. */
  stop(): Promise<void>;
}

export async function startHarness(_opts: HarnessOptions = {}): Promise<Harness> {
  throw new Error(
    "startHarness() is a scaffold — see implementation-notes.md (Feature #8). " +
      "For now, specs that need seeded D1 should be skipped or rewritten to run " +
      "against the locally-running dev stack with fixture writes via the API.",
  );
}
