/**
 * POST /v1/sessions — idempotent ingest of SessionRecord[].
 *
 * For each record:
 *  1. INSERT OR IGNORE into `sessions` keyed on (user_id, dedupe_key).
 *  2. If inserted (changes > 0), upsert into `daily_rollup` for that day.
 *
 * All statements run in a single DB.batch() call for atomicity.
 * Rate-limited to 60 calls/min per user via KV.
 *
 * After the DB write, fans out live events to every room the user belongs to
 * via RoomLiveHub Durable Objects (via ctx.waitUntil — does not affect latency).
 */
import { Hono } from "hono";
import { UploadSessionsRequest } from "@token-rats/contracts";
import type { Env } from "../env.js";
import type { AuthVariables } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";
import { validationError, rateLimited } from "../lib/errors.js";
import { rateLimit } from "../lib/rate-limit.js";
import { recordSession } from "../lib/ingest.js";

type HonoEnv = { Bindings: Env; Variables: AuthVariables };

const sessions = new Hono<HonoEnv>();

/** Fan out leaderboard-update and session-added events to all rooms the user belongs to. */
async function fanoutToRooms(
  env: Env,
  userId: string,
  totalTokens: number,
  totalCostUsdCents: number,
): Promise<void> {
  // Look up the user's handle for the session-added payload
  const user = await env.DB.prepare("SELECT handle FROM users WHERE id = ?")
    .bind(userId)
    .first<{ handle: string }>();

  if (!user) return;

  // Get every room the user belongs to
  const rooms = await env.DB.prepare(
    `SELECT r.code FROM rooms r
       INNER JOIN room_members rm ON rm.room_id = r.id
       WHERE rm.user_id = ?`,
  )
    .bind(userId)
    .all<{ code: string }>();

  if (!rooms.results || rooms.results.length === 0) return;

  const fanouts: Promise<void>[] = [];

  for (const { code } of rooms.results) {
    const id = env.ROOM_LIVE.idFromName(code);
    const stub = env.ROOM_LIVE.get(id);

    // session-added event
    const sessionAddedEvent = {
      kind: "session-added" as const,
      payload: {
        roomCode: code,
        handle: user.handle,
        tokens: totalTokens,
        costUsdCents: totalCostUsdCents,
      },
    };

    // leaderboard-update event
    const leaderboardUpdateEvent = {
      kind: "leaderboard-update" as const,
      payload: { roomCode: code },
    };

    fanouts.push(
      stub
        .fetch(
          new Request(`https://do/publish`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(sessionAddedEvent),
          }),
        )
        .then(() => undefined)
        .catch(() => undefined),
    );

    fanouts.push(
      stub
        .fetch(
          new Request(`https://do/publish`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(leaderboardUpdateEvent),
          }),
        )
        .then(() => undefined)
        .catch(() => undefined),
    );
  }

  await Promise.all(fanouts);
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

  // Persist each record via the shared helper
  const results = await Promise.all(records.map((r) => recordSession(c.env, userId, r)));

  const accepted = results.filter((r) => r.inserted).length;
  const duplicates = records.length - accepted;

  // Fan out live events for any newly inserted sessions — fire-and-forget via
  // waitUntil so ingest response latency is unaffected.
  if (accepted > 0) {
    const newRecords = records.filter((_, i) => results[i]?.inserted);
    const totalTokens = newRecords.reduce((s, r) => s + r.inTokens + r.outTokens, 0);
    const totalCostUsdCents = newRecords.reduce((s, r) => s + r.costUsdCents, 0);

    c.executionCtx.waitUntil(
      fanoutToRooms(c.env, userId, totalTokens, totalCostUsdCents),
    );
  }

  return c.json({ accepted, duplicates });
});

export default sessions;
