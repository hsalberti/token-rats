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

  return c.json({ accepted, duplicates });
});

export default sessions;
