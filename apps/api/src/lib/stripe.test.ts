/**
 * Unit tests for verifyStripeSignature (pure Web Crypto, no SDK).
 *
 * Uses the Web Crypto API available in the Node 20+ / Vitest environment.
 */

import { describe, it, expect } from "vitest";
import { verifyStripeSignature } from "./stripe.js";

/* ------------------------------------------------------------------ helpers */

const TEST_SECRET = "whsec_test_secret_for_unit_tests";
const TEST_BODY = JSON.stringify({ id: "evt_test", type: "customer.subscription.created" });

/** Build a real Stripe-Signature header for a given body + timestamp + secret. */
async function buildSignatureHeader(
  body: string,
  secret: string,
  timestampSec: number,
): Promise<string> {
  const signedPayload = `${timestampSec}.${body}`;
  const keyBytes = new TextEncoder().encode(secret);
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign(
    { name: "HMAC", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signedPayload),
  );
  // Convert to hex
  const sigHex = Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `t=${timestampSec},v1=${sigHex}`;
}

/* ------------------------------------------------------------------ tests */

describe("verifyStripeSignature", () => {
  it("accepts a valid signature within tolerance", async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const header = await buildSignatureHeader(TEST_BODY, TEST_SECRET, nowSec);

    const result = await verifyStripeSignature(TEST_BODY, header, TEST_SECRET);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.timestamp).toBe(nowSec);
    }
  });

  it("rejects a tampered body (signature mismatch)", async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const header = await buildSignatureHeader(TEST_BODY, TEST_SECRET, nowSec);

    // Tamper with the body after signing
    const tamperedBody = TEST_BODY + " tampered";
    const result = await verifyStripeSignature(tamperedBody, header, TEST_SECRET);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("signature_mismatch");
    }
  });

  it("rejects a stale timestamp (outside 300s tolerance)", async () => {
    const oldSec = Math.floor(Date.now() / 1000) - 400; // 400s ago — older than 5-min window
    const header = await buildSignatureHeader(TEST_BODY, TEST_SECRET, oldSec);

    const result = await verifyStripeSignature(TEST_BODY, header, TEST_SECRET);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("timestamp_outside_tolerance");
    }
  });

  it("rejects a header with no timestamp", async () => {
    const result = await verifyStripeSignature(TEST_BODY, "v1=deadbeef", TEST_SECRET);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("missing_timestamp");
    }
  });

  it("rejects a header with no v1 signature", async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const result = await verifyStripeSignature(TEST_BODY, `t=${nowSec}`, TEST_SECRET);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("missing_v1_signature");
    }
  });
});
