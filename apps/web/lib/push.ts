/**
 * Web Push subscription helper.
 *
 * 1. Registers /sw.js as the service worker.
 * 2. Requests Notification.requestPermission().
 * 3. Creates a PushSubscription using the VAPID public key from env.
 * 4. POSTs the subscription to the API.
 *
 * Usage:
 *   import { subscribeToPush } from "@/lib/push";
 *   await subscribeToPush();
 */

import { ENDPOINTS } from "@token-rats/contracts";
import { API_URL } from "./api";

/** URL-safe base64 → Uint8Array (for the VAPID application server key). */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export type PushSetupResult =
  | { ok: true }
  | { ok: false; reason: "unsupported" | "denied" | "error"; message?: string };

/**
 * Full push setup flow: register SW → ask permission → subscribe → post to API.
 * Returns a result discriminated union rather than throwing.
 */
export async function subscribeToPush(): Promise<PushSetupResult> {
  // Feature detection
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { ok: false, reason: "unsupported", message: "Push not supported in this browser" };
  }

  // Request notification permission
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, reason: "denied", message: "Notification permission denied" };
  }

  try {
    // Register (or reuse) the service worker
    const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });

    // Wait for the SW to be active
    await navigator.serviceWorker.ready;

    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) {
      return { ok: false, reason: "error", message: "VAPID public key not configured" };
    }

    const applicationServerKey = urlBase64ToUint8Array(vapidKey);

    // Subscribe (or retrieve existing subscription)
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });

    const json = subscription.toJSON();
    const endpoint = json.endpoint ?? "";
    const p256dh = json.keys?.p256dh ?? "";
    const auth = json.keys?.auth ?? "";

    if (!endpoint || !p256dh || !auth) {
      return { ok: false, reason: "error", message: "Invalid push subscription keys" };
    }

    // POST to API
    const res = await fetch(`${API_URL}${ENDPOINTS.pushSubscriptions}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint, keys: { p256dh, auth } }),
    });

    if (!res.ok) {
      return { ok: false, reason: "error", message: `API error: ${res.status}` };
    }

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Unsubscribe from push and delete the subscription on the server.
 */
export async function unsubscribeFromPush(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;

  const registration = await navigator.serviceWorker.getRegistration("/");
  if (!registration) return;

  const subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    await subscription.unsubscribe();
  }

  await fetch(`${API_URL}${ENDPOINTS.pushSubscriptions}`, {
    method: "DELETE",
    credentials: "include",
  });
}

/**
 * Send a test push to the current user via the API.
 */
export async function sendTestPush(): Promise<{ sent: boolean }> {
  const res = await fetch(`${API_URL}${ENDPOINTS.pushTest}`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json() as Promise<{ sent: boolean }>;
}
