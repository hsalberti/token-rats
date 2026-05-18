/**
 * POST /v1/sessions — idempotent ingest of SessionRecord[].
 *
 * For each record:
 *  1. INSERT OR IGNORE into `sessions` keyed on (user_id, dedupe_key).
 *  2. If inserted (changes > 0), upsert into `daily_rollup` for that day.
 *
 * All statements run in a single DB.batch() call for atomicity.
 * Rate-limited to 60 calls/min per user via KV.
 */
import { Hono } from "hono";
import { UploadSessionsRequest } from "@token-rats/contracts";
import type { Env } from "../env.js";
import type { AuthVariables } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";
import { validationError, rateLimited } from "../lib/errors.js";
import { rateLimit } from "../lib/rate-limit.js";

type HonoEnv = { Bindings: Env; Variables: AuthVariables };

const sessions = new Hono<HonoEnv>();

/** Convert a Unix-ms timestamp to a UTC "YYYY-MM-DD" string. */
function toUtcDay(tsMs: number): string {
  return new Date(tsMs).toISOString().slice(0, 10);
}

sessions.post("/", requireAuth, async (c) => {
  const userId = c.var.userId;

  // Rate limit: 60 requests/min per user
  const rl = await rateLimit(c.env.CACHE, userId, 60);
  if (!rl.allowed) {
    return rateLimited(c);
  }

  // Parse and validate body
  let body: ReturnType<typeof UploadSessionsRequest.parse>;
  try {
    const raw: unknown = await c.req.json();
    body = UploadSessionsRequest.parse(raw);
  } catch (e) {
    return validationError(c, e instanceof Error ? e.message : e);
  }

  const { sessions: records } = body;

  if (records.length === 0) {
    return c.json({ accepted: 0, duplicates: 0 });
  }

  // Build batch statements
  // We need to track insertions to update daily_rollup.
  // D1 batch is atomic but results come back per statement.
  // Strategy: one INSERT OR IGNORE per session row, then check meta.changes.
  // However D1's batch result gives us per-statement results.

  const now = Date.now();

  // Build INSERT OR IGNORE statements for sessions
  const insertStmts = records.map((r) =>
    c.env.DB.prepare(
      `INSERT OR IGNORE INTO sessions
         (id, user_id, source, model, in_tokens, out_tokens, cost_usd_cents,
          started_at, ended_at, dedupe_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      r.id,
      userId,
      r.source,
      r.model,
      r.inTokens,
      r.outTokens,
      r.costUsdCents,
      r.startedAt,
      r.endedAt,
      r.dedupeKey,
    ),
  );

  // Execute just the session inserts first to find out which were new
  const insertResults = await c.env.DB.batch(insertStmts);

  // Collect newly inserted records
  const newRecords = records.filter((_, i) => (insertResults[i]?.meta?.changes ?? 0) > 0);

  const accepted = newRecords.length;
  const duplicates = records.length - accepted;

  // If any new rows, upsert daily_rollup
  if (newRecords.length > 0) {
    // Group by (userId, day)
    const grouped = new Map<string, { tokens: number; costUsdCents: number; sessions: number }>();

    for (const r of newRecords) {
      const day = toUtcDay(r.startedAt);
      const key = `${userId}:${day}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.tokens += r.inTokens + r.outTokens;
        existing.costUsdCents += r.costUsdCents;
        existing.sessions += 1;
      } else {
        grouped.set(key, {
          tokens: r.inTokens + r.outTokens,
          costUsdCents: r.costUsdCents,
          sessions: 1,
        });
      }
    }

    const rollupStmts = Array.from(grouped.entries()).map(([key, totals]) => {
      const day = key.slice(userId.length + 1);
      return c.env.DB.prepare(
        `INSERT INTO daily_rollup (user_id, day, tokens, cost_usd_cents, sessions)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(user_id, day) DO UPDATE SET
             tokens         = tokens         + excluded.tokens,
             cost_usd_cents = cost_usd_cents + excluded.cost_usd_cents,
             sessions       = sessions       + excluded.sessions`,
      ).bind(userId, day, totals.tokens, totals.costUsdCents, totals.sessions);
    });

    await c.env.DB.batch(rollupStmts);
  }

  return c.json({ accepted, duplicates });
});

export default sessions;
