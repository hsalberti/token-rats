/**
 * Shared session-ingest helper.
 *
 * Both the CLI ingest route (`POST /v1/sessions`) and the proxy route
 * (`POST /v1/proxy/anthropic/v1/messages`) call `recordSession` to persist
 * a single `SessionRecord` into `sessions` + `daily_rollup`.
 *
 * Idempotency is guaranteed via the `dedupe_key` column:
 *   INSERT OR IGNORE → if rows == 0, it was already there.
 */

import type { SessionRecord } from "@token-rats/contracts";
import type { Env } from "../env.js";

/** Convert a Unix-ms timestamp to a UTC "YYYY-MM-DD" string. */
export function toUtcDay(tsMs: number): string {
  return new Date(tsMs).toISOString().slice(0, 10);
}

export interface RecordSessionResult {
  /** true if the session row was newly inserted; false if it was a duplicate. */
  inserted: boolean;
}

/**
 * Persist a single `SessionRecord` for `userId`.
 *
 * Runs two D1 statements in a batch:
 *  1. INSERT OR IGNORE into `sessions`.
 *  2. If inserted, upsert `daily_rollup` for the session's UTC day.
 *
 * Returns `{ inserted: true }` when the row is new, `{ inserted: false }` when
 * it was already present (idempotent replay).
 */
export async function recordSession(
  env: Env,
  userId: string,
  record: SessionRecord,
): Promise<RecordSessionResult> {
  const insertStmt = env.DB.prepare(
    `INSERT OR IGNORE INTO sessions
       (id, user_id, source, model, in_tokens, out_tokens, cost_usd_cents,
        started_at, ended_at, dedupe_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    record.id,
    userId,
    record.source,
    record.model,
    record.inTokens,
    record.outTokens,
    record.costUsdCents,
    record.startedAt,
    record.endedAt,
    record.dedupeKey,
  );

  const [insertResult] = await env.DB.batch([insertStmt]);
  const inserted = (insertResult?.meta?.changes ?? 0) > 0;

  if (inserted) {
    const day = toUtcDay(record.startedAt);
    const tokens = record.inTokens + record.outTokens;

    await env.DB.prepare(
      `INSERT INTO daily_rollup (user_id, day, tokens, cost_usd_cents, sessions)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_id, day) DO UPDATE SET
           tokens         = tokens         + excluded.tokens,
           cost_usd_cents = cost_usd_cents + excluded.cost_usd_cents,
           sessions       = sessions       + excluded.sessions`,
    )
      .bind(userId, day, tokens, record.costUsdCents, 1)
      .run();
  }

  return { inserted };
}
