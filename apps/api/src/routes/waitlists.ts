/**
 * Waitlists — v1.2 Track AA (also unblocks v1.1 Track X for provider:* topics).
 *
 *  POST /v1/waitlists  – idempotent insert keyed on (topic, email); rate-limited per IP.
 *
 * The admin read surface lives in `routes/admin.ts` so this file stays public-only.
 *
 * Rate limit: 10/day per IP. We key by client IP — the form is open to
 * signed-out visitors, so there's no userId to bucket against. We use the
 * existing KV-backed sliding window with a 24h window.
 */

import { Hono } from "hono";
import { z } from "zod";
import { CreateWaitlistRequest } from "@token-rats/contracts";
import type { Env } from "../env.js";
import type { AuthVariables } from "../middleware/auth.js";
import { rateLimited, validationError } from "../lib/errors.js";
import { rateLimit } from "../lib/rate-limit.js";
import { DAY_MS } from "../lib/time.js";

type HonoEnv = { Bindings: Env; Variables: AuthVariables };

const waitlists = new Hono<HonoEnv>();

/** Extract the client IP from CF headers, falling back to a deterministic
 *  string so rate-limit keys never collide with "everyone shares no-ip". */
function clientIp(c: { req: { header: (k: string) => string | undefined } }): string {
  return (
    c.req.header("cf-connecting-ip") ??
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

waitlists.post("/", async (c) => {
  // Rate limit BEFORE parsing so a flood of malformed bodies can't bypass it.
  const ip = clientIp(c);
  const rl = await rateLimit(c.env.CACHE, `waitlist:${ip}`, 10, DAY_MS);
  if (!rl.allowed) return rateLimited(c);

  let body: z.infer<typeof CreateWaitlistRequest>;
  try {
    const raw: unknown = await c.req.json();
    body = CreateWaitlistRequest.parse(raw);
  } catch (e) {
    return validationError(c, e instanceof z.ZodError ? e.issues : String(e));
  }

  const now = Date.now();
  const id = crypto.randomUUID();
  const payload = body.note ? JSON.stringify({ note: body.note }) : null;

  // Idempotent on (topic, email) — re-submitting just returns the original
  // position. We could DO UPDATE on the payload but the UX is "your spot is
  // already saved", so a no-op on conflict is the more honest behavior.
  await c.env.DB.prepare(
    `INSERT INTO waitlists (id, topic, email, github_login, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(topic, email) DO NOTHING`,
  )
    .bind(id, body.topic, body.email, body.githubLogin ?? null, payload, now)
    .run();

  // Position is 1-indexed rank by created_at within the topic.
  const positionRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS pos FROM waitlists
     WHERE topic = ? AND created_at <= (
       SELECT created_at FROM waitlists WHERE topic = ? AND email = ?
     )`,
  )
    .bind(body.topic, body.topic, body.email)
    .first<{ pos: number }>();

  return c.json({ ok: true as const, position: positionRow?.pos ?? 1 }, 201);
});

export default waitlists;
