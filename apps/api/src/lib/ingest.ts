/**
 * Shared session-ingest helper.
 *
 * Both the CLI ingest route (`POST /v1/sessions`) and the proxy route
 * (`POST /v1/proxy/anthropic/v1/messages`) call `recordSession` to persist
 * a single `SessionRecord` into `sessions` + `daily_rollup` +
 * `daily_rollup_by_model`.
 *
 * Idempotency / growing-session semantics:
 *   - If the session `id` is not in the DB → INSERT + full rollup.
 *   - If the session `id` already exists AND the incoming record has MORE
 *     tokens (in + out) than the stored row → UPDATE the session row and
 *     apply the DELTA to the rollups. This handles the common case where the
 *     watch daemon uploads a session the moment a file is created (0 tokens,
 *     only user turns so far) and then re-uploads once assistant turns
 *     accumulate tokens. The first INSERT stored 0 tokens; without the delta
 *     path the `INSERT OR IGNORE` on the `id` PK would silently discard every
 *     subsequent re-upload and leave the leaderboard frozen at 0.
 *   - If the session already exists with the same or more tokens → true no-op.
 *
 * Multi-device (migration 0017): when the caller provides a `deviceId`, the
 * sessions row is stamped with it and the `devices` table is upserted via
 * `upsertDeviceForIngest`. Older CLI clients that don't send a device id keep
 * ingesting with `device_id = NULL` (legacy bucket on the dashboard).
 */

import {
  type SessionRecord,
  defaultChannelForSource,
  defaultClientForSource,
  defaultProviderForSource,
} from "@token-rats/contracts";
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

/** Snapshot of the token columns we need to compute rollup deltas. */
interface ExistingTokens {
  in_tokens: number;
  out_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  reasoning_tokens: number;
  cost_usd_cents: number;
}

export async function recordSession(
  env: Env,
  userId: string,
  record: SessionRecord,
  opts: RecordSessionOptions = {},
): Promise<RecordSessionResult> {
  const deviceId = opts.deviceId ?? null;

  const existing = await env.DB.prepare(
    `SELECT in_tokens, out_tokens, cache_read_tokens, cache_write_tokens,
            reasoning_tokens, cost_usd_cents
       FROM sessions WHERE id = ?`,
  )
    .bind(record.id)
    .first<ExistingTokens>();

  if (!existing) {
    const insertStmt = buildInsertStmt(env, userId, record, deviceId);
    const [insertResult] = await env.DB.batch([insertStmt]);
    const inserted = (insertResult?.meta?.changes ?? 0) > 0;
    if (inserted) {
      await env.DB.batch(buildRollupStmts(env, userId, record));
    }
    return { inserted };
  }

  if (record.inTokens + record.outTokens > existing.in_tokens + existing.out_tokens) {
    const updateStmt = buildUpdateTokensStmt(env, userId, record);
    const [updateResult] = await env.DB.batch([updateStmt]);
    const updated = (updateResult?.meta?.changes ?? 0) > 0;
    if (updated) {
      await env.DB.batch(buildRollupDeltaStmts(env, userId, record, existing));
    }
    return { inserted: updated };
  }

  return { inserted: false };
}

/** Max statements per D1 `batch()` call (D1 caps a batch at 100 statements). */
const D1_BATCH_LIMIT = 100;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/** Build the `INSERT OR IGNORE INTO sessions` statement for one record. */
function buildInsertStmt(
  env: Env,
  userId: string,
  record: SessionRecord,
  deviceId: string | null,
): D1PreparedStatement {
  const provider = record.provider ?? defaultProviderForSource(record.source);
  const client = record.client ?? defaultClientForSource(record.source);
  const channel = record.channel ?? defaultChannelForSource(record.source);
  const cacheReadTokens = record.cacheReadTokens ?? 0;
  const cacheWriteTokens = record.cacheWriteTokens ?? 0;
  const reasoningTokens = record.reasoningTokens ?? 0;

  return env.DB.prepare(
    `INSERT OR IGNORE INTO sessions
       (id, user_id, source, provider, client, channel, model,
        in_tokens, out_tokens,
        cache_read_tokens, cache_write_tokens, reasoning_tokens,
        cost_usd_cents, started_at, ended_at, dedupe_key, device_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    record.id,
    userId,
    record.source,
    provider,
    client,
    channel,
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
}

/**
 * UPDATE an existing session row when re-syncing produces a higher token count.
 * Takes the MAX of ended_at so the session window can grow; always uses the
 * latest model slug (last-seen-wins, same as the parser).
 */
function buildUpdateTokensStmt(
  env: Env,
  userId: string,
  record: SessionRecord,
): D1PreparedStatement {
  const cacheReadTokens = record.cacheReadTokens ?? 0;
  const cacheWriteTokens = record.cacheWriteTokens ?? 0;
  const reasoningTokens = record.reasoningTokens ?? 0;

  return env.DB.prepare(
    `UPDATE sessions SET
       in_tokens          = ?,
       out_tokens         = ?,
       cache_read_tokens  = ?,
       cache_write_tokens = ?,
       reasoning_tokens   = ?,
       cost_usd_cents     = ?,
       ended_at           = MAX(ended_at, ?),
       model              = ?,
       dedupe_key         = ?
     WHERE id = ? AND user_id = ?`,
  ).bind(
    record.inTokens,
    record.outTokens,
    cacheReadTokens,
    cacheWriteTokens,
    reasoningTokens,
    record.costUsdCents,
    record.endedAt,
    record.model,
    record.dedupeKey,
    record.id,
    userId,
  );
}

/** Build the legacy + granular rollup upserts for one inserted record. */
function buildRollupStmts(
  env: Env,
  userId: string,
  record: SessionRecord,
): [D1PreparedStatement, D1PreparedStatement] {
  const provider = record.provider ?? defaultProviderForSource(record.source);
  const cacheReadTokens = record.cacheReadTokens ?? 0;
  const cacheWriteTokens = record.cacheWriteTokens ?? 0;
  const reasoningTokens = record.reasoningTokens ?? 0;
  const day = toUtcDay(record.startedAt);
  const tokens = record.inTokens + record.outTokens;

  return [
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
  ];
}

/**
 * Build rollup UPDATE statements that apply only the TOKEN DELTA for a session
 * whose row already existed in `sessions`. Does NOT increment session counts
 * since the session was already counted on its first insertion.
 */
function buildRollupDeltaStmts(
  env: Env,
  userId: string,
  record: SessionRecord,
  old: ExistingTokens,
): [D1PreparedStatement, D1PreparedStatement] {
  const provider = record.provider ?? defaultProviderForSource(record.source);
  const cacheReadTokens = record.cacheReadTokens ?? 0;
  const cacheWriteTokens = record.cacheWriteTokens ?? 0;
  const reasoningTokens = record.reasoningTokens ?? 0;
  const day = toUtcDay(record.startedAt);

  const deltaTokens = record.inTokens + record.outTokens - old.in_tokens - old.out_tokens;
  const deltaCost = record.costUsdCents - old.cost_usd_cents;
  const deltaIn = record.inTokens - old.in_tokens;
  const deltaOut = record.outTokens - old.out_tokens;
  const deltaCacheRead = cacheReadTokens - old.cache_read_tokens;
  const deltaCacheWrite = cacheWriteTokens - old.cache_write_tokens;
  const deltaReasoning = reasoningTokens - old.reasoning_tokens;

  return [
    env.DB.prepare(
      `INSERT INTO daily_rollup (user_id, day, tokens, cost_usd_cents, sessions)
         VALUES (?, ?, ?, ?, 0)
         ON CONFLICT(user_id, day) DO UPDATE SET
           tokens         = tokens         + excluded.tokens,
           cost_usd_cents = cost_usd_cents + excluded.cost_usd_cents`,
    ).bind(userId, day, deltaTokens, deltaCost),
    env.DB.prepare(
      `INSERT INTO daily_rollup_by_model
         (user_id, day, source, provider, model,
          in_tokens, out_tokens,
          cache_read_tokens, cache_write_tokens, reasoning_tokens,
          cost_usd_cents, sessions)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
       ON CONFLICT(user_id, day, source, provider, model) DO UPDATE SET
         in_tokens          = in_tokens          + excluded.in_tokens,
         out_tokens         = out_tokens         + excluded.out_tokens,
         cache_read_tokens  = cache_read_tokens  + excluded.cache_read_tokens,
         cache_write_tokens = cache_write_tokens + excluded.cache_write_tokens,
         reasoning_tokens   = reasoning_tokens   + excluded.reasoning_tokens,
         cost_usd_cents     = cost_usd_cents     + excluded.cost_usd_cents`,
    ).bind(
      userId,
      day,
      record.source,
      provider,
      record.model,
      deltaIn,
      deltaOut,
      deltaCacheRead,
      deltaCacheWrite,
      deltaReasoning,
      deltaCost,
    ),
  ];
}

export interface RecordSessionsBatchResult {
  /** Parallel to the input array: `true` where the session was newly inserted or had its token count updated. */
  inserted: boolean[];
  /** Count of newly inserted (non-duplicate) sessions. */
  acceptedCount: number;
}

/**
 * Bulk equivalent of `recordSession` for the ingest hot path.
 *
 * Collapses what used to be `O(records)` sequential `DB.batch` round-trips into
 * a handful of chunked batches (≤ `D1_BATCH_LIMIT` statements each):
 *   0. One SELECT to fetch existing token counts for all incoming session IDs.
 *   1. All `INSERT OR IGNORE` statements for new sessions, in one set of chunks.
 *   2. All `UPDATE` statements for sessions with token-count increases.
 *   3. Full rollup upserts for new inserts + delta rollup updates for token growth.
 *
 * The `inserted` array is `true` for both genuinely new sessions AND for
 * existing sessions whose token count grew — callers use it to fan out live
 * events and check milestones, both of which are fine with over-reporting.
 */
export async function recordSessionsBatch(
  env: Env,
  userId: string,
  records: SessionRecord[],
  opts: RecordSessionOptions = {},
): Promise<RecordSessionsBatchResult> {
  const deviceId = opts.deviceId ?? null;

  const inserted: boolean[] = new Array(records.length).fill(false);
  if (records.length === 0) {
    return { inserted, acceptedCount: 0 };
  }

  // Step 0: Fetch existing token counts for all incoming session IDs so we can
  // distinguish new records from sessions that already exist but have grown.
  const placeholders = records.map(() => "?").join(",");
  const existingRows = await env.DB.prepare(
    `SELECT id, in_tokens, out_tokens, cache_read_tokens, cache_write_tokens,
            reasoning_tokens, cost_usd_cents
       FROM sessions WHERE user_id = ? AND id IN (${placeholders})`,
  )
    .bind(userId, ...records.map((r) => r.id))
    .all<{ id: string } & ExistingTokens>();

  const existingById = new Map(existingRows.results.map((r) => [r.id, r]));

  // Partition records into inserts vs token-growth updates.
  const toInsert: Array<{ idx: number; record: SessionRecord }> = [];
  const toUpdate: Array<{ idx: number; record: SessionRecord; old: ExistingTokens }> = [];

  for (let i = 0; i < records.length; i++) {
    const record = records[i]!;
    const existing = existingById.get(record.id);
    if (!existing) {
      toInsert.push({ idx: i, record });
    } else if (record.inTokens + record.outTokens > existing.in_tokens + existing.out_tokens) {
      toUpdate.push({ idx: i, record, old: existing });
    }
    // else: same or fewer tokens → true no-op, leave inserted[i] = false
  }

  // Step 1: INSERT new sessions.
  if (toInsert.length > 0) {
    const insertStmts = toInsert.map(({ record }) =>
      buildInsertStmt(env, userId, record, deviceId),
    );
    let cursor = 0;
    for (const group of chunk(insertStmts, D1_BATCH_LIMIT)) {
      const results = await env.DB.batch(group);
      for (let i = 0; i < group.length; i++) {
        inserted[toInsert[cursor + i]!.idx] = (results[i]?.meta?.changes ?? 0) > 0;
      }
      cursor += group.length;
    }
  }

  // Step 2: UPDATE sessions whose token count grew.
  if (toUpdate.length > 0) {
    const updateStmts = toUpdate.map(({ record }) => buildUpdateTokensStmt(env, userId, record));
    let cursor = 0;
    for (const group of chunk(updateStmts, D1_BATCH_LIMIT)) {
      const results = await env.DB.batch(group);
      for (let i = 0; i < group.length; i++) {
        inserted[toUpdate[cursor + i]!.idx] = (results[i]?.meta?.changes ?? 0) > 0;
      }
      cursor += group.length;
    }
  }

  // Step 3: Full rollup for new inserts.
  const rollupStmts: D1PreparedStatement[] = [];
  for (let i = 0; i < records.length; i++) {
    if (!inserted[i]) continue;
    const record = records[i]!;
    const existing = existingById.get(record.id);
    if (!existing) {
      rollupStmts.push(...buildRollupStmts(env, userId, record));
    } else {
      // Step 3b: Delta rollup for token-growth updates.
      rollupStmts.push(...buildRollupDeltaStmts(env, userId, record, existing));
    }
  }

  for (const group of chunk(rollupStmts, D1_BATCH_LIMIT)) {
    await env.DB.batch(group);
  }

  const acceptedCount = inserted.reduce((n, ins) => (ins ? n + 1 : n), 0);
  return { inserted, acceptedCount };
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
