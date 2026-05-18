/**
 * Unit tests for auth helpers.
 *
 * These run in Node via Vitest (no Worker env needed) because the helpers
 * only use Web Crypto APIs, which are available in Node 18+.
 */
import { describe, expect, it } from "vitest";
import {
  TOKEN_TTL_CLI,
  TOKEN_TTL_WEB,
  randomBase64url,
  randomVerificationCode,
  signToken,
  verifyToken,
} from "./auth.js";

const SIGNING_KEY = "test-signing-key-at-least-32-bytes!!";

describe("signToken / verifyToken", () => {
  it("round-trips a token correctly", async () => {
    const userId = crypto.randomUUID();
    const token = await signToken(userId, SIGNING_KEY, TOKEN_TTL_WEB);

    // Should have three dot-separated parts
    const parts = token.split(".");
    expect(parts).toHaveLength(3);

    const result = await verifyToken(token, SIGNING_KEY);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.userId).toBe(userId);
    }
  });

  it("rejects a tampered userId", async () => {
    const token = await signToken("user-a", SIGNING_KEY, TOKEN_TTL_WEB);
    const parts = token.split(".");
    // Swap user id
    const tampered = ["user-b", parts[1], parts[2]].join(".");
    const result = await verifyToken(tampered, SIGNING_KEY);
    expect(result.ok).toBe(false);
  });

  it("rejects an expired token", async () => {
    // TTL = 0 → already expired by the time we verify
    const token = await signToken("user-x", SIGNING_KEY, -1);
    const result = await verifyToken(token, SIGNING_KEY);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("expired");
    }
  });

  it("rejects a token signed with a different key", async () => {
    const token = await signToken("user-y", SIGNING_KEY, TOKEN_TTL_CLI);
    const result = await verifyToken(token, "a-completely-different-key!!");
    expect(result.ok).toBe(false);
  });

  it("rejects a malformed token", async () => {
    const result = await verifyToken("not.a.valid.token.extra", SIGNING_KEY);
    expect(result.ok).toBe(false);
  });
});

describe("randomBase64url", () => {
  it("returns a non-empty string", () => {
    const s = randomBase64url(32);
    expect(typeof s).toBe("string");
    expect(s.length).toBeGreaterThan(0);
  });

  it("returns different values each call", () => {
    const a = randomBase64url(16);
    const b = randomBase64url(16);
    expect(a).not.toBe(b);
  });

  it("produces only URL-safe characters", () => {
    const s = randomBase64url(64);
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("randomVerificationCode", () => {
  it("matches XXXX-YYYY pattern", () => {
    const code = randomVerificationCode();
    expect(code).toMatch(/^[A-Z]{4}-[0-9]{4}$/);
  });

  it("returns different values each call", () => {
    const codes = new Set(Array.from({ length: 20 }, randomVerificationCode));
    // Extremely unlikely to collide 20 times; space = 24^4 * 10^4 ≈ 12.9M
    expect(codes.size).toBeGreaterThan(1);
  });
});
