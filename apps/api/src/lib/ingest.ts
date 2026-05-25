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
 * Multi-device (migration 0017): when the caller provides a `deviceId`, the
 * sessions row is stamped with it and the `devices` table is upserted via
 * `upsertDeviceForIngest`. Older CLI clients that don't send a device id keep
 * ingesting with `device_id = NULL` (legacy bucket on the dashboard).
 */

import { type SessionRecord, defaultProviderForSource } from "@token-rats/contracts";
import type { Env } from "../env.js";

/** Convert a Unix-ms timestamp to a UTC "YYYY-MM-DD" string. */
export function toUtcDay(tsMs: number): string {
  return new Date(tsMs).toISOString().slice(0, 10);
}

export interface RecordSessionResult {
  inserted: boolean;
}

export interface RecordSessionOptions {
  /** Opaque per-install device id from the CLI (`X-Device-Id`), if present. */
  deviceId?: string | null;
}

export async function recordSession(
  env: Env,
  userId: string,
  record: SessionRecord,
  opts: RecordSessionOptions = {},
): Promise<RecordSessionResult> {
  const provider = record.provider ?? defaultProviderForSource(record.source);
  const cacheReadTokens = record.cacheReadTokens ?? 0;
  const cacheWriteTokens = record.cacheWriteTokens ?? 0;
  const reasoningTokens = record.reasoningTokens ?? 0;
  const deviceId = opts.deviceId ?? null;

  const insertStmt = env.DB.prepare(
    `INSERT OR IGNORE INTO sessions
       (id, user_id, source, provider, model,
        in_tokens, out_tokens,
        cache_read_tokens, cache_write_tokens, reasoning_tokens,
        cost_usd_cents, started_at, ended_at, dedupe_key, device_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    deviceId,
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

/**
 * Upsert the `devices` row associated with this ingest call. Returns
 * `{ revoked: true }` when the device has been disconnected via the web UI;
 * callers should short-circuit ingest with a 401 in that case.
 */
export async function upsertDeviceForIngest(
  env: Env,
  userId: string,
  deviceId: string,
  cliVersion: string | null,
  uploadedRows: number,
  nowMs: number = Date.now(),
): Promise<{ revoked: boolean }> {
  const existing = await env.DB.prepare(
    "SELECT user_id, revoked_at FROM devices WHERE device_id = ?",
  )
    .bind(deviceId)
    .first<{ user_id: string; revoked_at: number | null }>();

  if (existing && existing.revoked_at !== null) {
    return { revoked: true };
  }

  if (existing) {
    if (existing.user_id !== userId) {
      // Defensive: device ids are UUIDs and shouldn't collide across users.
      // Refuse the upload rather than land on another user's row.
      return { revoked: true };
    }
    await env.DB.prepare(
      `UPDATE devices
          SET last_seen_at      = ?,
              last_upload_count = last_upload_count + ?,
              cli_version       = COALESCE(?, cli_version)
        WHERE device_id = ?`,
    )
      .bind(nowMs, uploadedRows, cliVersion, deviceId)
      .run();
  } else {
    await env.DB.prepare(
      `INSERT INTO devices
         (device_id, user_id, created_at, last_seen_at, last_upload_count, cli_version)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(deviceId, userId, nowMs, nowMs, uploadedRows, cliVersion)
      .run();
  }
  return { revoked: false };
}
