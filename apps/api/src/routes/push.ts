/**
 * Push subscription routes:
 *   POST   /v1/push/subscriptions  — upsert a push subscription
 *   DELETE /v1/push/subscriptions  — delete all subs for the calling user
 *   POST   /v1/push/test           — send a test push to the calling user
 */
import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../env.js";
import { validationError } from "../lib/errors.js";
import { sendWebPush } from "../lib/webpush.js";
import type { AuthVariables } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";

type HonoEnv = { Bindings: Env; Variables: AuthVariables };

const push = new Hono<HonoEnv>();

/** Inline schema (mirrors CreatePushSubscriptionRequest in contracts). */
const CreatePushSubscriptionBody = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

/* -------------------------------------------------------------------------- */
/* POST /v1/push/subscriptions                                                 */
/* -------------------------------------------------------------------------- */

push.post("/subscriptions", requireAuth, async (c) => {
  const userId = c.var.userId;

  let body: z.infer<typeof CreatePushSubscriptionBody>;
  try {
    const raw: unknown = await c.req.json();
    body = CreatePushSubscriptionBody.parse(raw);
  } catch (e) {
    return validationError(c, e instanceof Error ? e.message : e);
  }

  const { endpoint, keys } = body;
  const id = crypto.randomUUID();
  const now = Date.now();

  await c.env.DB.prepare(
    `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, endpoint) DO UPDATE SET
       p256dh     = excluded.p256dh,
       auth       = excluded.auth,
       created_at = excluded.created_at`,
  )
    .bind(id, userId, endpoint, keys.p256dh, keys.auth, now)
    .run();

  return c.json({ ok: true }, 200);
});

/* -------------------------------------------------------------------------- */
/* DELETE /v1/push/subscriptions                                               */
/* -------------------------------------------------------------------------- */

push.delete("/subscriptions", requireAuth, async (c) => {
  const userId = c.var.userId;

  const result = await c.env.DB.prepare("DELETE FROM push_subscriptions WHERE user_id = ?")
    .bind(userId)
    .run();

  return c.json({ deleted: result.meta?.changes ?? 0 });
});

/* -------------------------------------------------------------------------- */
/* POST /v1/push/test                                                          */
/* -------------------------------------------------------------------------- */

push.post("/test", requireAuth, async (c) => {
  const userId = c.var.userId;

  // Fetch all subscriptions for this user
  const result = await c.env.DB.prepare(
    "SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?",
  )
    .bind(userId)
    .all<{ endpoint: string; p256dh: string; auth: string }>();

  const subs = result.results ?? [];

  if (subs.length === 0) {
    return c.json({ sent: false });
  }

  const payload = {
    title: "Token Rats",
    body: "Test notification — your push is working!",
    url: "/app",
  };

  const vapidSubject = `mailto:noreply@${new URL(c.env.WEB_ORIGIN).hostname}`;

  let sent = false;
  for (const sub of subs) {
    const ok = await sendWebPush(
      sub,
      payload,
      c.env.VAPID_PRIVATE_KEY,
      c.env.VAPID_PUBLIC_KEY,
      vapidSubject,
    );
    if (ok) sent = true;
  }

  return c.json({ sent });
});

export default push;
