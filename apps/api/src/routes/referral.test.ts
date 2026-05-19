import { GetReferralResponse, ReferralStats } from "@token-rats/contracts";
/**
 * Unit tests for the referral helpers + GetReferralResponse contract.
 * Pure logic only — no D1, no network.
 */
import { describe, expect, it } from "vitest";
import { generateReferralCode, isValidReferralCodeFormat } from "../lib/referral.js";

describe("referral code generation", () => {
  it("produces URL-safe codes that pass the format gate", () => {
    for (let i = 0; i < 20; i++) {
      const c = generateReferralCode();
      expect(isValidReferralCodeFormat(c)).toBe(true);
      expect(c).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(c.length).toBeGreaterThanOrEqual(6);
    }
  });

  it("rejects obviously bad codes", () => {
    expect(isValidReferralCodeFormat("")).toBe(false);
    expect(isValidReferralCodeFormat("short")).toBe(false);
    expect(isValidReferralCodeFormat("has spaces here")).toBe(false);
    expect(isValidReferralCodeFormat("inj';--ect")).toBe(false);
    expect(isValidReferralCodeFormat("x".repeat(33))).toBe(false);
  });
});

describe("ReferralStats contract", () => {
  it("accepts an empty stats payload", () => {
    const parsed = ReferralStats.parse({ code: "abc123XY", count: 0, recent: [] });
    expect(parsed.count).toBe(0);
    expect(parsed.recent).toEqual([]);
  });

  it("accepts a populated recent list", () => {
    const parsed = GetReferralResponse.parse({
      referral: {
        code: "abc123XY",
        count: 2,
        recent: [
          { handle: "ada", avatarUrl: "https://example.com/a.png", createdAt: 1 },
          { handle: "linus", avatarUrl: null, createdAt: 2 },
        ],
      },
    });
    expect(parsed.referral.count).toBe(2);
    expect(parsed.referral.recent).toHaveLength(2);
  });

  it("rejects a negative count", () => {
    const r = ReferralStats.safeParse({ code: "abc123XY", count: -1, recent: [] });
    expect(r.success).toBe(false);
  });
});
