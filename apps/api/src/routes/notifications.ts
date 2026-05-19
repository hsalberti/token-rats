/**
 * Notification preference routes:
 *   GET  /v1/notifications/preferences  — get the calling user's prefs
 *   POST /v1/notifications/preferences  — upsert the calling user's prefs
 *   POST /v1/notifications/unsubscribe?token=<signed>  — flips weekly_digest off
 *     from a signed link in an email (no cookie required).
 */
import { Hono } from "hono";
import { z } from "zod";
import type { NotificationPrefs } from "@token-rats/contracts";
import type { Env } from "../env.js";
import type { AuthVariables } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";
import { validationError } from "../lib/errors.js";
import { verifyUnsubscribeToken } from "../lib/digest.js";

/** Inline schema (mirrors UpsertNotificationPrefsRequest in contracts). */
const UpsertPrefsBody = z
  .object({
    weeklyDigest: z.boolean(),
    roomChallenges: z.boolean(),
    passed: z.boolean(),
  })
  .partial();

type HonoEnv = { Bindings: Env; Variables: AuthVariables };

const notifications = new Hono<HonoEnv>();

interface NotificationPrefsRow {
  weekly_digest: number;
  room_challenges: number;
  passed: number;
}

/** Default prefs — all enabled. */
const DEFAULT_PREFS: NotificationPrefs = {
  weeklyDigest: true,
  roomChallenges: true,
  passed: true,
};

/* -------------------------------------------------------------------------- */
/* GET /v1/notifications/preferences                                           */
/* -------------------------------------------------------------------------- */

notifications.get("/preferences", requireAuth, async (c) => {
  const userId = c.var.userId;

  const row = await c.env.DB.prepare(
    "SELECT weekly_digest, room_challenges, passed FROM notification_prefs WHERE user_id = ?",
  )
    .bind(userId)
    .first<NotificationPrefsRow>();

  if (!row) {
    return c.json({ prefs: DEFAULT_PREFS });
  }

  return c.json({
    prefs: {
      weeklyDigest: row.weekly_digest === 1,
      roomChallenges: row.room_challenges === 1,
      passed: row.passed === 1,
    },
  });
});

/* -------------------------------------------------------------------------- */
/* POST /v1/notifications/preferences                                          */
/* -------------------------------------------------------------------------- */

notifications.post("/preferences", requireAuth, async (c) => {
  const userId = c.var.userId;

  let body: z.infer<typeof UpsertPrefsBody>;
  try {
    const raw: unknown = await c.req.json();
    body = UpsertPrefsBody.parse(raw);
  } catch (e) {
    return validationError(c, e instanceof Error ? e.message : e);
  }

  const now = Date.now();

  // Fetch existing to merge partial update
  const existing = await c.env.DB.prepare(
    "SELECT weekly_digest, room_challenges, passed FROM notification_prefs WHERE user_id = ?",
  )
    .bind(userId)
    .first<NotificationPrefsRow>();

  const merged = {
    weeklyDigest:
      body.weeklyDigest !== undefined
        ? body.weeklyDigest
        : existing
          ? existing.weekly_digest === 1
          : DEFAULT_PREFS.weeklyDigest,
    roomChallenges:
      body.roomChallenges !== undefined
        ? body.roomChallenges
        : existing
          ? existing.room_challenges === 1
          : DEFAULT_PREFS.roomChallenges,
    passed:
      body.passed !== undefined
        ? body.passed
        : existing
          ? existing.passed === 1
          : DEFAULT_PREFS.passed,
  };

  await c.env.DB.prepare(
    `INSERT INTO notification_prefs (user_id, weekly_digest, room_challenges, passed, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       weekly_digest   = excluded.weekly_digest,
       room_challenges = excluded.room_challenges,
       passed          = excluded.passed,
       updated_at      = excluded.updated_at`,
  )
    .bind(
      userId,
      merged.weeklyDigest ? 1 : 0,
      merged.roomChallenges ? 1 : 0,
      merged.passed ? 1 : 0,
      now,
    )
    .run();

  return c.json({ prefs: merged });
});

/* -------------------------------------------------------------------------- */
/* POST /v1/notifications/unsubscribe?token=<signed>                          */
/* -------------------------------------------------------------------------- */

function unsubscribePage(message: string, ok: boolean): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Token Rats — Unsubscribe</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="background:#09090b;color:#f4f4f5;font-family:system-ui,sans-serif;margin:0;padding:64px 24px">
  <div style="max-width:480px;margin:0 auto;text-align:center">
    <h1 style="font-size:24px;margin:0 0 12px">${ok ? "You're unsubscribed." : "Couldn't unsubscribe."}</h1>
    <p style="color:#a1a1aa;margin:0 0 24px">${message}</p>
    <a href="/settings/notifications" style="color:#f97316">Manage preferences</a>
  </div>
</body>
</html>`;
}

notifications.post("/unsubscribe", async (c) => {
  const token = c.req.query("token");
  if (!token) {
    return c.html(unsubscribePage("Missing token in link.", false), 400);
  }

  const result = await verifyUnsubscribeToken(token, c.env.SESSION_SIGNING_KEY);
  if (!result.ok) {
    return c.html(
      unsubscribePage("That unsubscribe link is invalid or has been tampered with.", false),
      400,
    );
  }

  const now = Date.now();
  await c.env.DB.prepare(
    `INSERT INTO notification_prefs (user_id, weekly_digest, room_challenges, passed, updated_at)
     VALUES (?, 0, 1, 1, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       weekly_digest = 0,
       updated_at    = excluded.updated_at`,
  )
    .bind(result.userId, now)
    .run();

  return c.html(unsubscribePage("You won't get the weekly Token Rats digest anymore.", true), 200);
});

export default notifications;
