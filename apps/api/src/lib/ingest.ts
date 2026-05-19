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
  // v1.2 Track AF — persist `source_plan` (nullable). The CLI sends it on
  // every new SessionRecord; pre-AF rows simply degrade to NULL and the
  // read-side primary-source compute treats them as plan = unknown.
  const insertStmt = env.DB.prepare(
    `INSERT OR IGNORE INTO sessions
       (id, user_id, source, model, in_tokens, out_tokens, cost_usd_cents,
        started_at, ended_at, dedupe_key, source_plan)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    record.sourcePlan ?? null,
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

    // v1.2 Track AD — bust the friends cache for every co-member of every
    // private room this user is in. Their `fr:` view includes this user as
    // a friend row whose stats just changed.
    //
    // Done here (rather than in routes/sessions.ts where the lb: bust lives)
    // so the proxy ingest path also picks it up. Fire-and-forget — if the KV
    // delete fails, the worst case is a 60s stale read.
    await bustFriendCachesForCoMembers(env, userId);

    // v1.2 Track AF — bust the per-user primary-source cache so the next
    // leaderboard / profile / trending read recomputes the pill against the
    // freshly-ingested session. Tiny cost vs. the 5 min stale window.
    await env.CACHE.delete(`ps:${userId}`);
  }

  return { inserted };
}

/**
 * Delete `fr:<otherUserId>:<range>` for every user that shares a private room
 * with `userId`, plus the caller's own cache (their own range numbers may
 * affect the trailing "vs you" comparison the web UI will render).
 *
 * One KV delete per (user, range) — bounded by the size of the user's
 * private-room co-member set, which is small in practice.
 */
async function bustFriendCachesForCoMembers(env: Env, userId: string): Promise<void> {
  // Test-time envs sometimes omit CACHE — short-circuit so this doesn't break
  // unit suites that only exercise the DB write path.
  if (!env.CACHE) return;

  const result = await env.DB.prepare(
    `SELECT DISTINCT rm_other.user_id AS user_id
       FROM room_members rm_self
       JOIN rooms r ON r.id = rm_self.room_id
       JOIN room_members rm_other ON rm_other.room_id = r.id
      WHERE rm_self.user_id = ?
        AND COALESCE(r.is_public, 0) = 0`,
  )
    .bind(userId)
    .all<{ user_id: string }>();

  const userIds = new Set<string>([userId]);
  for (const row of result.results ?? []) {
    userIds.add(row.user_id);
  }

  const ranges = ["today", "7d", "30d", "all"] as const;
  const deletes: Promise<void>[] = [];
  for (const uid of userIds) {
    for (const r of ranges) {
      deletes.push(env.CACHE.delete(`fr:${uid}:${r}`));
    }
  }
  await Promise.all(deletes);
}
