/**
 * VAPID + Web Push sender for Cloudflare Workers.
 *
 * Implements the Web Push Protocol (RFC 8030) with VAPID (RFC 8292) and
 * payload encryption per RFC 8291 ("aes128gcm" content encoding from
 * RFC 8188), using only the Web Crypto API available in Cloudflare Workers
 * (no Node-only deps).
 *
 * Pipeline summary (per RFC 8291 §3):
 *
 *   1. Generate an ephemeral P-256 keypair (the "as" / application server key).
 *   2. ECDH-derive the shared secret with the client's `p256dh` public key.
 *   3. HKDF-SHA-256 with `auth_secret` as salt and
 *      info = "WebPush: info\0" || ua_public || as_public  → 32-byte IKM-PRK.
 *   4. Generate a 16-byte random encryption salt.
 *   5. HKDF-Expand the IKM-PRK with that salt and:
 *        - info = "Content-Encoding: aes128gcm\0"  → 16-byte content key (CEK).
 *        - info = "Content-Encoding: nonce\0"      → 12-byte nonce.
 *   6. AES-128-GCM encrypt `plaintext || 0x02` (single record padding delimiter).
 *   7. Concatenate the aes128gcm header `salt(16) || rs(4)=4096 || idlen(1)=65
 *      || keyid(65) = as_public_uncompressed` with the ciphertext.
 *   8. POST to the subscription endpoint with VAPID Authorization header.
 *
 * The VAPID JWT signer (`buildVapidJwt`) below is unchanged from before.
 */

export interface PushSubscriptionData {
  endpoint: string;
  p256dh: string; // base64url-encoded client public key (uncompressed point)
  auth: string; // base64url-encoded 16-byte auth secret
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

/** Result so callers can report honestly to the user. */
export type SendWebPushResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "encryption-not-implemented"
        | "delivery-failed"
        | "invalid-subscription"
        | "error";
      status?: number;
    };

/* -------------------------------------------------------------------------- */
/* Base64url helpers                                                           */
/* -------------------------------------------------------------------------- */

export function base64urlToUint8Array(b64: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(b64)) {
    throw new Error("invalid base64url input");
  }
  const padding = "=".repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function uint8ArrayToBase64url(arr: Uint8Array): string {
  let binary = "";
  for (const byte of arr) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function objectToBase64url(obj: unknown): string {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  return uint8ArrayToBase64url(bytes);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* VAPID JWT signing                                                          */
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
  publicKeyB64url: string,
): Promise<string> {
  const header = objectToBase64url({ typ: "JWT", alg: "ES256" });
  const now = Math.floor(Date.now() / 1000);
  const claims = objectToBase64url({
    aud: audience,
    exp: now + 12 * 3600,
    sub: subject,
    iat: now,
  });

  const signingInput = `${header}.${claims}`;
  const signingInputBytes = new TextEncoder().encode(signingInput);

  // The raw 32-byte VAPID private key must be paired with its public key to be
  // importable as a JWK. Convert (d, x, y) → JWK.
  const d = privateKeyB64url;
  const uncompressed = base64urlToUint8Array(publicKeyB64url);
  if (uncompressed.length !== 65 || uncompressed[0] !== 0x04) {
    throw new Error("VAPID public key must be uncompressed P-256 (65 bytes, 0x04 prefix)");
  }
  const x = uint8ArrayToBase64url(uncompressed.slice(1, 33));
  const y = uint8ArrayToBase64url(uncompressed.slice(33, 65));

  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", d, x, y, ext: true },
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
/* HKDF helpers (RFC 5869)                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Single HKDF-Extract-then-Expand using SubtleCrypto.deriveBits.
 * RFC 5869: HKDF(salt, ikm, info, length) where Extract uses HMAC-SHA-256(salt, ikm).
 */
async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  const baseKey = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    baseKey,
    length * 8,
  );
  return new Uint8Array(bits);
}

/* -------------------------------------------------------------------------- */
/* aes128gcm payload encryption (RFC 8291)                                    */
/* -------------------------------------------------------------------------- */

export interface EncryptedPayload {
  /** Full aes128gcm encoded body: header || ciphertext. */
  body: Uint8Array;
  /** The 16-byte random salt used (also embedded in body). */
  salt: Uint8Array;
  /** The application-server ephemeral public key, uncompressed (65 bytes). */
  asPublic: Uint8Array;
}

interface EncryptOptions {
  plaintext: Uint8Array;
  /** Client p256dh public key, uncompressed bytes (65 bytes). */
  uaPublic: Uint8Array;
  /** 16-byte auth_secret from the subscription. */
  authSecret: Uint8Array;
  /** Optional: override the random ephemeral keypair (for tests). */
  asKeyPair?: CryptoKeyPair;
  /** Optional: override the random 16-byte salt (for tests). */
  salt?: Uint8Array;
}

/**
 * Encrypt a Web Push payload per RFC 8291. Single-record (rs=4096) — our
 * notification bodies are well under 3993 bytes (4096 - 16 GCM tag - 87 header).
 */
export async function encryptPayload(opts: EncryptOptions): Promise<EncryptedPayload> {
  if (opts.uaPublic.length !== 65 || opts.uaPublic[0] !== 0x04) {
    throw new Error("ua public key must be uncompressed P-256 (65 bytes, 0x04 prefix)");
  }
  if (opts.authSecret.length !== 16) {
    throw new Error("auth secret must be 16 bytes");
  }

  // Step 1 — ephemeral AS keypair.
  const asKeyPair =
    opts.asKeyPair ??
    ((await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveBits"],
    )) as CryptoKeyPair);

  const asPublicRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", asKeyPair.publicKey),
  );

  // Step 2 — import UA public key for ECDH.
  const uaKey = await crypto.subtle.importKey(
    "raw",
    opts.uaPublic,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );

  // Step 3 — ECDH shared secret.
  const ecdhBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: uaKey },
    asKeyPair.privateKey,
    256,
  );
  const ecdhSecret = new Uint8Array(ecdhBits);

  // Step 4 — IKM = HKDF(auth_secret, ecdhSecret, "WebPush: info\0" || ua || as, 32)
  const webpushInfo = concat(
    new TextEncoder().encode("WebPush: info\0"),
    opts.uaPublic,
    asPublicRaw,
  );
  const ikm = await hkdf(opts.authSecret, ecdhSecret, webpushInfo, 32);

  // Step 5 — random 16-byte salt (or test-injected).
  const salt = opts.salt ?? crypto.getRandomValues(new Uint8Array(16));
  if (salt.length !== 16) throw new Error("salt must be 16 bytes");

  // Step 6 — CEK and nonce derivations.
  const cekInfo = new TextEncoder().encode("Content-Encoding: aes128gcm\0");
  const nonceInfo = new TextEncoder().encode("Content-Encoding: nonce\0");
  const cek = await hkdf(salt, ikm, cekInfo, 16);
  const nonce = await hkdf(salt, ikm, nonceInfo, 12);

  // Step 7 — encrypt plaintext || 0x02 (single-record delimiter, RFC 8188 §2).
  const padded = concat(opts.plaintext, new Uint8Array([0x02]));
  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, [
    "encrypt",
  ]);
  const ctBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, padded);
  const ciphertext = new Uint8Array(ctBuf);

  // Step 8 — aes128gcm header per RFC 8188 §2.1:
  //   salt(16) || rs(4, big-endian) || idlen(1) || keyid(idlen)
  // For Web Push, keyid = as_public uncompressed (65 bytes), idlen = 65.
  const rs = 4096;
  const header = new Uint8Array(16 + 4 + 1 + 65);
  header.set(salt, 0);
  header[16] = (rs >>> 24) & 0xff;
  header[17] = (rs >>> 16) & 0xff;
  header[18] = (rs >>> 8) & 0xff;
  header[19] = rs & 0xff;
  header[20] = 65;
  header.set(asPublicRaw, 21);

  return { body: concat(header, ciphertext), salt, asPublic: asPublicRaw };
}

/* -------------------------------------------------------------------------- */
/* Web Push sender                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Send a push notification to a single subscription. Returns a structured
 * result so callers (e.g. /v1/push/test) can report honestly.
 *
 * Network errors / 4xx-5xx from the push service surface as
 * `{ ok: false, reason: "delivery-failed", status }`. A 404/410 specifically
 * means the subscription is dead and should be deleted by the caller — we
 * tag those as `invalid-subscription`.
 */
export async function sendWebPush(
  subscription: PushSubscriptionData,
  payload: PushPayload,
  vapidPrivateKey: string,
  vapidPublicKey: string,
  vapidSubject: string,
  ttlSeconds = 60 * 60 * 24,
): Promise<SendWebPushResult> {
  let uaPublic: Uint8Array;
  let authSecret: Uint8Array;
  try {
    uaPublic = base64urlToUint8Array(subscription.p256dh);
    authSecret = base64urlToUint8Array(subscription.auth);
  } catch {
    return { ok: false, reason: "invalid-subscription" };
  }

  let endpointUrl: URL;
  try {
    endpointUrl = new URL(subscription.endpoint);
  } catch {
    return { ok: false, reason: "invalid-subscription" };
  }

  try {
    const plaintext = new TextEncoder().encode(JSON.stringify(payload));
    const encrypted = await encryptPayload({ plaintext, uaPublic, authSecret });

    const audience = `${endpointUrl.protocol}//${endpointUrl.host}`;
    const jwt = await buildVapidJwt(audience, vapidSubject, vapidPrivateKey, vapidPublicKey);

    const res = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        Authorization: `vapid t=${jwt}, k=${vapidPublicKey}`,
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: String(ttlSeconds),
      },
      body: encrypted.body,
    });

    if (res.status >= 200 && res.status < 300) return { ok: true };
    if (res.status === 404 || res.status === 410) {
      return { ok: false, reason: "invalid-subscription", status: res.status };
    }
    return { ok: false, reason: "delivery-failed", status: res.status };
  } catch {
    return { ok: false, reason: "error" };
  }
}
