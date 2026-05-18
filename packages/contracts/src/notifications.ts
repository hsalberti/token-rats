import { z } from "zod";

/* ----------------------------- Push subscriptions ------------------------- */

export const PushSubscriptionKeys = z.object({
  p256dh: z.string().min(1),
  auth: z.string().min(1),
});
export type PushSubscriptionKeys = z.infer<typeof PushSubscriptionKeys>;

export const CreatePushSubscriptionRequest = z.object({
  endpoint: z.string().url(),
  keys: PushSubscriptionKeys,
});
export type CreatePushSubscriptionRequest = z.infer<typeof CreatePushSubscriptionRequest>;

export const CreatePushSubscriptionResponse = z.object({ ok: z.boolean() });
export type CreatePushSubscriptionResponse = z.infer<typeof CreatePushSubscriptionResponse>;

export const DeletePushSubscriptionResponse = z.object({ deleted: z.number().int().nonnegative() });
export type DeletePushSubscriptionResponse = z.infer<typeof DeletePushSubscriptionResponse>;

export const PushTestResponse = z.object({ sent: z.boolean() });
export type PushTestResponse = z.infer<typeof PushTestResponse>;

/* -------------------------- Notification preferences ---------------------- */

export const NotificationPrefs = z.object({
  weeklyDigest: z.boolean(),
  roomChallenges: z.boolean(),
  passed: z.boolean(),
});
export type NotificationPrefs = z.infer<typeof NotificationPrefs>;

export const UpsertNotificationPrefsRequest = NotificationPrefs.partial();
export type UpsertNotificationPrefsRequest = z.infer<typeof UpsertNotificationPrefsRequest>;

export const NotificationPrefsResponse = z.object({ prefs: NotificationPrefs });
export type NotificationPrefsResponse = z.infer<typeof NotificationPrefsResponse>;

/* ----------------------------- Push payload ------------------------------- */

/** Shape of the JSON pushed to the browser in a Web Push notification. */
export const PushPayload = z.object({
  title: z.string(),
  body: z.string(),
  url: z.string().optional(),
});
export type PushPayload = z.infer<typeof PushPayload>;
