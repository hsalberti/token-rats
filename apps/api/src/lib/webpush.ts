/**
 * VAPID + Web Push sender for Cloudflare Workers.
 *
 * This module is the thin orchestrator. The encryption choreography lives
 * in `webpush-encrypt.ts`. We:
 *   - parse the UA subscription,
 *   - sign the VAPID JWT,
 *   - encrypt the payload (`encryptAes128Gcm`),
 *   - POST the record to the push service,
 *   - signal 404/410 ("subscription gone") to the caller so the route can
 *     delete the row.
 *
 * VAPID JWT signing is local because it's two `crypto.subtle` calls (ES256
 * over a fixed JWT shape) — not worth a separate module.
 */

import { base64urlToUint8Array, encryptAes128Gcm, uint8ArrayToBase64url } from "./webpush-encrypt.js";

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
/* base64url JSON helper (small + local — VAPID JWT only)                     */
/* -------------------------------------------------------------------------- */

function objectToBase64url(obj: unknown): string {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  return uint8ArrayToBase64url(bytes);
}

/* -------------------------------------------------------------------------- */
/* VAPID JWT signing                                                           */
/* -------------------------------------------------------------------------- */

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

  const privateKeyBytes = base64urlToUint8Array(privateKeyB64url);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    privateKeyBytes,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

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
 * Outcome of a single push delivery. `gone` is the signal /v1/push/test
 * (and any other caller) uses to hard-delete the subscription row.
 */
export type SendWebPushResult =
  | { ok: true }
  | { ok: false; reason: "gone"; status: 404 | 410 }
  | { ok: false; reason: "delivery-failed"; status: number; bodySnippet: string }
  | { ok: false; reason: "error"; message: string };

const TTL_SECONDS = 60 * 60 * 24; // 24h — push service holds the message if UA is offline
const URGENCY = "normal";

export async function sendWebPush(
  subscription: PushSubscriptionData,
  payload: PushPayload,
  vapidPrivateKey: string,
  vapidPublicKey: string,
  vapidSubject: string,
): Promise<SendWebPushResult> {
  let endpoint: URL;
  try {
    endpoint = new URL(subscription.endpoint);
  } catch (err) {
    return {
      ok: false,
      reason: "error",
      message: `Invalid subscription endpoint: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Encrypt the payload.
  let body: Uint8Array;
  try {
    const plaintext = new TextEncoder().encode(JSON.stringify(payload));
    const record = await encryptAes128Gcm(plaintext, {
      p256dh: subscription.p256dh,
      auth: subscription.auth,
    });
    body = record.body;
  } catch (err) {
    return {
      ok: false,
      reason: "error",
      message: `Encryption failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // VAPID JWT.
  let jwt: string;
  try {
    jwt = await buildVapidJwt(endpoint.origin, vapidSubject, vapidPrivateKey);
  } catch (err) {
    return {
      ok: false,
      reason: "error",
      message: `VAPID JWT failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const headers = new Headers({
    Authorization: `vapid t=${jwt}, k=${vapidPublicKey}`,
    "Content-Encoding": "aes128gcm",
    "Content-Type": "application/octet-stream",
    TTL: String(TTL_SECONDS),
    Urgency: URGENCY,
  });

  let res: Response;
  try {
    res = await fetch(endpoint.toString(), {
      method: "POST",
      headers,
      body,
    });
  } catch (err) {
    return {
      ok: false,
      reason: "error",
      message: `Push fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (res.status === 201 || res.status === 202) {
    return { ok: true };
  }

  if (res.status === 404 || res.status === 410) {
    // RFC 8030 §7.3: "the push subscription is no longer valid". The caller
    // hard-deletes the row.
    return { ok: false, reason: "gone", status: res.status };
  }

  let bodySnippet = "";
  try {
    bodySnippet = (await res.text()).slice(0, 200);
  } catch {
    // ignore
  }

  return {
    ok: false,
    reason: "delivery-failed",
    status: res.status,
    bodySnippet,
  };
}
