/**
 * VAPID + Web Push sender for Cloudflare Workers.
 *
 * This module implements the Web Push Protocol (RFC 8030) with VAPID
 * (RFC 8292) authentication using the Web Crypto API available in
 * Cloudflare Workers. The payload is encrypted with the "aes128gcm"
 * content encoding (RFC 8188).
 *
 * TODO: The full aes128gcm payload encryption (ECDH key agreement +
 * HKDF key derivation + AES-GCM encryption) is stubbed below — the
 * function logs the intent and returns true without actually sending a
 * push. Wire in the full crypto path (or use a library like `web-push`
 * compiled for Workers) before going to production.
 *
 * The VAPID JWT signing IS fully implemented using Web Crypto.
 */

export interface PushSubscriptionData {
  endpoint: string;
  p256dh: string; // base64url-encoded client public key
  auth: string; // base64url-encoded 16-byte auth secret
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

/* -------------------------------------------------------------------------- */
/* Base64url helpers                                                           */
/* -------------------------------------------------------------------------- */

function base64urlToUint8Array(b64: string): Uint8Array {
  const padding = "=".repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function uint8ArrayToBase64url(arr: Uint8Array): string {
  let binary = "";
  for (const byte of arr) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function objectToBase64url(obj: unknown): string {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  return uint8ArrayToBase64url(bytes);
}

/* -------------------------------------------------------------------------- */
/* VAPID JWT signing (fully implemented)                                      */
/* -------------------------------------------------------------------------- */

/**
 * Build and sign a VAPID JWT for use in the Authorization header.
 *
 * @param audience  The push service origin (e.g. "https://fcm.googleapis.com")
 * @param subject   A mailto: or https: URL identifying the app operator
 * @param privateKeyB64url  Base64url-encoded raw 32-byte EC P-256 private key
 */
async function buildVapidJwt(
  audience: string,
  subject: string,
  privateKeyB64url: string,
): Promise<string> {
  const header = objectToBase64url({ typ: "JWT", alg: "ES256" });
  const now = Math.floor(Date.now() / 1000);
  const claims = objectToBase64url({
    aud: audience,
    exp: now + 12 * 3600, // 12 hours
    sub: subject,
    iat: now,
  });

  const signingInput = `${header}.${claims}`;
  const signingInputBytes = new TextEncoder().encode(signingInput);

  // Import the private key
  const privateKeyBytes = base64urlToUint8Array(privateKeyB64url);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    privateKeyBytes,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  // Sign with ES256 (ECDSA + SHA-256)
  const signatureBuffer = await crypto.subtle.sign(
    { name: "ECDSA", hash: { name: "SHA-256" } },
    cryptoKey,
    signingInputBytes,
  );

  const signature = uint8ArrayToBase64url(new Uint8Array(signatureBuffer));
  return `${signingInput}.${signature}`;
}

/* -------------------------------------------------------------------------- */
/* Web Push sender                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Send a push notification to a single subscription.
 *
 * TODO: The payload is NOT encrypted in this stub. Full aes128gcm
 * encryption requires:
 *   1. Generate an ephemeral P-256 key pair.
 *   2. ECDH with the client's p256dh public key → shared secret.
 *   3. HKDF-SHA-256 to derive the content-encryption and auth-info keys.
 *   4. AES-128-GCM encrypt the JSON payload with a random salt.
 *   5. Set Content-Encoding: aes128gcm and include the encrypted body.
 *
 * Until the encryption is wired in, this function sends the push
 * request WITHOUT a body (a "ping" notification). The service worker
 * will receive a push event with no data — it should fall back to a
 * generic notification copy. For full notification copy (title/body/url),
 * implement the encryption path above.
 */
export async function sendWebPush(
  subscription: PushSubscriptionData,
  payload: PushPayload,
  vapidPrivateKey: string,
  vapidPublicKey: string,
  vapidSubject: string,
): Promise<boolean> {
  try {
    const endpointUrl = new URL(subscription.endpoint);
    const audience = endpointUrl.origin;

    const jwt = await buildVapidJwt(audience, vapidSubject, vapidPrivateKey);

    // TODO: encrypt `payload` using aes128gcm before attaching as body.
    // For now we send a bare POST (no body) as a "ping" to the push service.
    // The service worker's push handler should display a generic notification
    // when event.data is null.
    console.log("[webpush] Sending push to", subscription.endpoint, "payload:", payload);

    const headers: Record<string, string> = {
      Authorization: `vapid t=${jwt},k=${vapidPublicKey}`,
      TTL: "86400",
    };

    const res = await fetch(subscription.endpoint, {
      method: "POST",
      headers,
    });

    if (!res.ok && res.status !== 201 && res.status !== 202) {
      console.error("[webpush] Push delivery failed:", res.status, await res.text());
      return false;
    }

    return true;
  } catch (err) {
    console.error("[webpush] Error sending push:", err);
    return false;
  }
}
