/**
 * Shared session-ingest helper.
 *
 * Both the CLI ingest route (`POST /v1/sessions`) and the proxy route
 * (`POST /v1/proxy/anthropic/v1/messages`) call `recordSession` to persist
 * a single `SessionRecord` into `sessions` + `daily_rollup` +
 * `daily_rollup_by_model`.
 *
 * Idempotency is guaranteed via the `dedupe_key` column:
 *   INSERT OR IGNORE → if rows == 0, it was already there.
 *
 * `daily_rollup` is the legacy aggregate that powers the existing leaderboard
 * queries (one row per user-day, totals only). `daily_rollup_by_model` is the
 * granular aggregate (one row per user-day-source-provider-model) added in
 * migration 0013 so per-IDE / per-vendor / per-model analytics don't require
 * scanning the full `sessions` table. Both are kept in sync on every insert.
 */

import { type SessionRecord, defaultProviderForSource } from "@token-rats/contracts";
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
 * Three writes per new session:
 *  1. INSERT OR IGNORE into `sessions` (with granular token columns).
 *  2. Upsert legacy `daily_rollup` for the session's UTC day.
 *  3. Upsert granular `daily_rollup_by_model` for the same day, keyed by
 *     (source, provider, model).
 *
 * Returns `{ inserted: true }` when the row is new, `{ inserted: false }` when
 * it was already present (idempotent replay).
 */
export async function recordSession(
  env: Env,
  userId: string,
  record: SessionRecord,
): Promise<RecordSessionResult> {
  // Older CLIs don't send `provider` / cache / reasoning fields. Fill in safe
  // defaults so the DB columns are always non-null and analytics queries don't
  // have to special-case legacy rows.
  const provider = record.provider ?? defaultProviderForSource(record.source);
  const cacheReadTokens = record.cacheReadTokens ?? 0;
  const cacheWriteTokens = record.cacheWriteTokens ?? 0;
  const reasoningTokens = record.reasoningTokens ?? 0;

  const insertStmt = env.DB.prepare(
    `INSERT OR IGNORE INTO sessions
       (id, user_id, source, provider, model,
        in_tokens, out_tokens,
        cache_read_tokens, cache_write_tokens, reasoning_tokens,
        cost_usd_cents, started_at, ended_at, dedupe_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    record.id,
    userId,
    record.source,
    provider,
    record.model,
    record.inTokens,
    record.outTokens,
    cacheReadTokens,
    cacheWriteTokens,
    reasoningTokens,
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

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO daily_rollup (user_id, day, tokens, cost_usd_cents, sessions)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(user_id, day) DO UPDATE SET
             tokens         = tokens         + excluded.tokens,
             cost_usd_cents = cost_usd_cents + excluded.cost_usd_cents,
             sessions       = sessions       + excluded.sessions`,
      ).bind(userId, day, tokens, record.costUsdCents, 1),
      env.DB.prepare(
        `INSERT INTO daily_rollup_by_model
           (user_id, day, source, provider, model,
            in_tokens, out_tokens,
            cache_read_tokens, cache_write_tokens, reasoning_tokens,
            cost_usd_cents, sessions)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, day, source, provider, model) DO UPDATE SET
           in_tokens          = in_tokens          + excluded.in_tokens,
           out_tokens         = out_tokens         + excluded.out_tokens,
           cache_read_tokens  = cache_read_tokens  + excluded.cache_read_tokens,
           cache_write_tokens = cache_write_tokens + excluded.cache_write_tokens,
           reasoning_tokens   = reasoning_tokens   + excluded.reasoning_tokens,
           cost_usd_cents     = cost_usd_cents     + excluded.cost_usd_cents,
           sessions           = sessions           + excluded.sessions`,
      ).bind(
        userId,
        day,
        record.source,
        provider,
        record.model,
        record.inTokens,
        record.outTokens,
        cacheReadTokens,
        cacheWriteTokens,
        reasoningTokens,
        record.costUsdCents,
        1,
      ),
    ]);
  }

  return { inserted };
}
