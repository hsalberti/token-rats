/** Atomic session upserts. SQLite triggers maintain both rollups in the same transaction. */
import {
  type SessionRecord,
  defaultChannelForSource,
  defaultClientForSource,
  defaultProviderForSource,
} from "@token-rats/contracts";
import type { Env } from "../env.js";

export function toUtcDay(tsMs: number): string {
  return new Date(tsMs).toISOString().slice(0, 10);
}
export interface RecordSessionOptions {
  deviceId?: string | null;
}
export interface RecordSessionResult {
  inserted: boolean;
}
export interface RecordSessionsBatchResult {
  inserted: boolean[];
  acceptedCount: number;
}

function upsertStatement(env: Env, userId: string, r: SessionRecord, deviceId: string | null) {
  return env.DB.prepare(`INSERT INTO sessions
    (id, user_id, source, provider, client, channel, model, in_tokens, out_tokens,
     cache_read_tokens, cache_write_tokens, reasoning_tokens, cost_usd_cents,
     started_at, ended_at, dedupe_key, device_id, accounting_version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      model = excluded.model, provider = excluded.provider, client = excluded.client, channel = excluded.channel,
      in_tokens = excluded.in_tokens, out_tokens = excluded.out_tokens,
      cache_read_tokens = excluded.cache_read_tokens, cache_write_tokens = excluded.cache_write_tokens,
      reasoning_tokens = excluded.reasoning_tokens, cost_usd_cents = excluded.cost_usd_cents,
      started_at = excluded.started_at, ended_at = excluded.ended_at,
      dedupe_key = excluded.dedupe_key, accounting_version = excluded.accounting_version
    WHERE sessions.user_id = excluded.user_id AND sessions.source = excluded.source
      AND excluded.ended_at >= sessions.ended_at
      AND excluded.accounting_version >= sessions.accounting_version
      AND (excluded.accounting_version > sessions.accounting_version
        OR excluded.in_tokens + excluded.out_tokens + excluded.cache_read_tokens + excluded.cache_write_tokens
          > sessions.in_tokens + sessions.out_tokens + sessions.cache_read_tokens + sessions.cache_write_tokens)
    ON CONFLICT(user_id, dedupe_key) DO NOTHING`).bind(
    r.id,
    userId,
    r.source,
    r.provider ?? defaultProviderForSource(r.source),
    r.client ?? defaultClientForSource(r.source),
    r.channel ?? defaultChannelForSource(r.source),
    r.model,
    r.inTokens,
    r.outTokens,
    r.cacheReadTokens ?? 0,
    r.cacheWriteTokens ?? 0,
    r.reasoningTokens ?? 0,
    r.costUsdCents,
    r.startedAt,
    r.endedAt,
    r.dedupeKey,
    deviceId,
    r.accountingVersion ?? 1,
  );
}

export async function recordSession(
  env: Env,
  userId: string,
  record: SessionRecord,
  opts: RecordSessionOptions = {},
): Promise<RecordSessionResult> {
  const result = await recordSessionsBatch(env, userId, [record], opts);
  return { inserted: result.inserted[0] ?? false };
}

export async function recordSessionsBatch(
  env: Env,
  userId: string,
  records: SessionRecord[],
  opts: RecordSessionOptions = {},
): Promise<RecordSessionsBatchResult> {
  const inserted: boolean[] = [];
  // Every statement has fewer than D1's 100 bind parameters. Each chunk commits
  // with its trigger writes, so a retry after a later failure is idempotent.
  for (let i = 0; i < records.length; i += 90) {
    const result = await env.DB.batch(
      records.slice(i, i + 90).map((r) => upsertStatement(env, userId, r, opts.deviceId ?? null)),
    );
    inserted.push(...result.map((r) => (r.meta.changes ?? 0) > 0));
  }
  return { inserted, acceptedCount: inserted.filter(Boolean).length };
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
