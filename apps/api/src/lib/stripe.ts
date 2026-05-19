/**
 * Pure Web Crypto Stripe webhook signature verification.
 * No Stripe SDK required — verifies HMAC-SHA256 over the raw body.
 *
 * Stripe signs webhooks with:
 *   Stripe-Signature: t=<timestamp>,v1=<hex_sig>[,v1=<hex_sig2>...]
 *
 * The signed payload is: `${timestamp}.${rawBody}`
 * The HMAC key is the webhook secret (plain UTF-8).
 *
 * Docs: https://stripe.com/docs/webhooks/signatures
 */

const ALG = { name: "HMAC", hash: "SHA-256" };

/** Import the webhook secret as a CryptoKey for HMAC-SHA256. */
async function importWebhookKey(secret: string): Promise<CryptoKey> {
  const keyBytes = new TextEncoder().encode(secret);
  return crypto.subtle.importKey("raw", keyBytes, ALG, false, ["sign", "verify"]);
}

/** Convert a hex string to a Uint8Array. */
function hexToBytes(hex: string): Uint8Array {
  const len = hex.length;
  if (len % 2 !== 0) throw new Error("Invalid hex string");
  const bytes = new Uint8Array(len / 2);
  for (let i = 0; i < len; i += 2) {
    bytes[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

export type VerifyStripeResult = { ok: true; timestamp: number } | { ok: false; reason: string };

/**
 * Verify a Stripe webhook signature.
 *
 * @param rawBody      - Raw request body as a string (read before any JSON parsing)
 * @param sigHeader    - Value of the `Stripe-Signature` header
 * @param secret       - STRIPE_WEBHOOK_SECRET (`whsec_*`)
 * @param toleranceSec - Maximum age of the event in seconds (default 300 = 5 min)
 */
export async function verifyStripeSignature(
  rawBody: string,
  sigHeader: string,
  secret: string,
  toleranceSec = 300,
): Promise<VerifyStripeResult> {
  // Parse header: t=<ts>,v1=<sig1>[,v1=<sig2>...]
  const parts = sigHeader.split(",");
  let timestamp: number | null = null;
  const v1Sigs: string[] = [];

  for (const part of parts) {
    const [key, value] = part.split("=", 2) as [string, string | undefined];
    if (!value) continue;
    if (key === "t") {
      timestamp = Number.parseInt(value, 10);
    } else if (key === "v1") {
      v1Sigs.push(value);
    }
  }

  if (timestamp === null || !Number.isFinite(timestamp)) {
    return { ok: false, reason: "missing_timestamp" };
  }
  if (v1Sigs.length === 0) {
    return { ok: false, reason: "missing_v1_signature" };
  }

  // Replay protection: reject events older than toleranceSec
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - timestamp) > toleranceSec) {
    return { ok: false, reason: "timestamp_outside_tolerance" };
  }

  const signedPayload = `${timestamp}.${rawBody}`;
  const key = await importWebhookKey(secret);

  // Verify each provided v1 sig — valid if any one matches
  for (const sigHex of v1Sigs) {
    let sigBytes: Uint8Array;
    try {
      sigBytes = hexToBytes(sigHex);
    } catch {
      continue; // skip malformed hex
    }
    const valid = await crypto.subtle.verify(
      ALG,
      key,
      sigBytes,
      new TextEncoder().encode(signedPayload),
    );
    if (valid) return { ok: true, timestamp };
  }

  return { ok: false, reason: "signature_mismatch" };
}
