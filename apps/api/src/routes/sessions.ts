import { UploadSessionsRequest } from "@token-rats/contracts";
/**
 * POST /v1/sessions — idempotent ingest of SessionRecord[].
 *
 * Per record: `INSERT OR IGNORE` into `sessions` and (on success) upsert into
 * `daily_rollup` + `daily_rollup_by_model` (see `lib/ingest.ts`).
 *
 * Rate-limited to 60 calls/min per user via KV.
 *
 * Multi-device: reads `X-Device-Id` and `X-Cli-Version` headers (both
 * optional). When a device id is present, the ingest checks the device's
 * `revoked_at` first and short-circuits with 401 if the user disconnected it
 * via the web UI. Otherwise the device row is upserted with the latest seen
 * timestamps. CLIs that don't send a device id continue to ingest with
 * `device_id = NULL`.
 *
 * After the DB write, fans out live events to every room the user belongs to
 * via RoomLiveHub Durable Objects (via ctx.waitUntil — does not affect latency).
 */
import { Hono } from "hono";
import type { Env } from "../env.js";
import { rateLimited, validationError } from "../lib/errors.js";
import { recordSessionsBatch, toUtcDay, upsertDeviceForIngest } from "../lib/ingest.js";
import { maybeNotifyMilestone } from "../lib/milestone-notify.js";
import { loadPriceIndex, priceWithIndex } from "../lib/pricing.js";
import { rateLimit } from "../lib/rate-limit.js";
import type { AuthVariables } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";

type HonoEnv = { Bindings: Env; Variables: AuthVariables };

const sessions = new Hono<HonoEnv>();

/** Accept only printable-ASCII ids of plausible length; reject anything that
 *  could be a header-injection attempt or a bogus CLI scribble. */
function isPlausibleDeviceId(s: string): boolean {
  return /^[A-Za-z0-9_-]{8,128}$/.test(s);
}

function isPlausibleCliVersion(s: string): boolean {
  return /^[A-Za-z0-9._+-]{1,32}$/.test(s);
}

/** Fan out leaderboard-update and session-added events to all rooms the user belongs to. */
async function fanoutToRooms(
  env: Env,
  userId: string,
  totalTokens: number,
  totalCostUsdCents: number,
): Promise<void> {
  const user = await env.DB.prepare("SELECT handle FROM users WHERE id = ?")
    .bind(userId)
    .first<{ handle: string }>();

  if (!user) return;

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

    const sessionAddedEvent = {
      kind: "session-added" as const,
      payload: {
        roomCode: code,
        handle: user.handle,
        tokens: totalTokens,
        costUsdCents: totalCostUsdCents,
      },
    };

    const leaderboardUpdateEvent = {
      kind: "leaderboard-update" as const,
      payload: { roomCode: code },
    };

    fanouts.push(
      stub
        .fetch(
          new Request("https://do/publish", {
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
          new Request("https://do/publish", {
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

  // Device headers — both optional, both validated before we trust them in SQL.
  const deviceIdHeader = c.req.header("X-Device-Id");
  const cliVersionHeader = c.req.header("X-Cli-Version");
  const deviceId = deviceIdHeader && isPlausibleDeviceId(deviceIdHeader) ? deviceIdHeader : null;
  const cliVersion =
    cliVersionHeader && isPlausibleCliVersion(cliVersionHeader) ? cliVersionHeader : null;

  // Parse and validate body
  let body: ReturnType<typeof UploadSessionsRequest.parse>;
  try {
    const raw: unknown = await c.req.json();
    body = UploadSessionsRequest.parse(raw);
  } catch (e) {
    return validationError(c, e instanceof Error ? e.message : e);
  }

  const { sessions: records } = body;

  // Empty payload is a heartbeat — upsert device + last_heartbeat_at and return.
  if (records.length === 0) {
    if (deviceId) {
      const dev = await upsertDeviceForIngest(c.env, userId, deviceId, cliVersion, 0);
      if (dev.revoked) {
        return c.json({ error: "device_revoked" }, 401);
      }
      // Empty body still counts as a "ping" → bump heartbeat too.
      await c.env.DB.prepare("UPDATE devices SET last_heartbeat_at = ? WHERE device_id = ?")
        .bind(Date.now(), deviceId)
        .run();
    }
    return c.json({ accepted: 0, duplicates: 0 });
  }

  // If the caller sent a device id, validate it BEFORE running the priced
  // upserts so a revoked device never leaves a partial trail.
  if (deviceId) {
    const dev = await upsertDeviceForIngest(c.env, userId, deviceId, cliVersion, records.length);
    if (dev.revoked) {
      // Use authRequired-shaped 401 so the CLI's existing 401 handler clears the token.
      return c.json({ error: "device_revoked" }, 401);
    }
  }

  // Price the whole batch in-memory off a single index load. priceOf() does a
  // KV/D1 round-trip per call, which blows the Worker subrequest budget on a
  // large multi-record ingest; loadPriceIndex pulls the (small) price tables
  // once and priceWithIndex resolves each record with zero I/O.
  const priceIndex = await loadPriceIndex(c.env);
  const pricedRecords = records.map((r) => {
    const { costUsdCents } = priceWithIndex(
      priceIndex,
      r.model,
      toUtcDay(r.startedAt),
      r.inTokens,
      r.outTokens,
      r.cacheReadTokens ?? 0,
      r.cacheWriteTokens ?? 0,
    );
    return { ...r, costUsdCents };
  });

  const { inserted, acceptedCount: accepted } = await recordSessionsBatch(
    c.env,
    userId,
    pricedRecords,
    { deviceId },
  );

  const duplicates = records.length - accepted;

  if (accepted > 0) {
    const newRecords = pricedRecords.filter((_, i) => inserted[i]);
    const totalTokens = newRecords.reduce((s, r) => s + r.inTokens + r.outTokens, 0);
    const totalCostUsdCents = newRecords.reduce((s, r) => s + r.costUsdCents, 0);
    c.executionCtx.waitUntil(fanoutToRooms(c.env, userId, totalTokens, totalCostUsdCents));
    // Best-effort lifetime-token milestone push. Self-contained + idempotent;
    // swallows its own errors so it can never affect ingest.
    c.executionCtx.waitUntil(
      maybeNotifyMilestone(c.env, userId, totalTokens).catch(() => undefined),
    );
  }

  return c.json({ accepted, duplicates });
});

export default sessions;
