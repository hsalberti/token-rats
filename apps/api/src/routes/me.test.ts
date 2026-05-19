/**
 * Unit tests for the PATCH /v1/me validation schema (PatchMeRequest).
 *
 * These test the Zod schema in isolation — no network, no D1.
 */
import { describe, it, expect } from "vitest";
import { PatchMeRequest } from "@token-rats/contracts";

describe("PatchMeRequest validation", () => {
  it("accepts an empty object (no-op patch)", () => {
    const result = PatchMeRequest.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts publicProfile=true", () => {
    const result = PatchMeRequest.safeParse({ publicProfile: true });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.publicProfile).toBe(true);
  });

  it("accepts publicProfile=false", () => {
    const result = PatchMeRequest.safeParse({ publicProfile: false });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.publicProfile).toBe(false);
  });

  it("accepts a short bio", () => {
    const result = PatchMeRequest.safeParse({ bio: "I burn tokens for fun." });
    expect(result.success).toBe(true);
  });

  it("rejects a bio longer than 200 chars", () => {
    const result = PatchMeRequest.safeParse({ bio: "x".repeat(201) });
    expect(result.success).toBe(false);
  });

  it("accepts bio: null (clear the bio)", () => {
    const result = PatchMeRequest.safeParse({ bio: null });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.bio).toBeNull();
  });

  it("accepts a twitterHandle", () => {
    const result = PatchMeRequest.safeParse({ twitterHandle: "vibedev" });
    expect(result.success).toBe(true);
  });

  it("rejects twitterHandle longer than 50 chars", () => {
    const result = PatchMeRequest.safeParse({ twitterHandle: "x".repeat(51) });
    expect(result.success).toBe(false);
  });

  it("accepts twitterHandle: null (clear the handle)", () => {
    const result = PatchMeRequest.safeParse({ twitterHandle: null });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.twitterHandle).toBeNull();
  });

  it("accepts all three fields together", () => {
    const result = PatchMeRequest.safeParse({
      publicProfile: true,
      bio: "Shipping fast",
      twitterHandle: "tokenrat",
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-boolean publicProfile", () => {
    const result = PatchMeRequest.safeParse({ publicProfile: "yes" });
    expect(result.success).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* v1.2 Track AC — User contract surfaces twitterVerified                     */
/* -------------------------------------------------------------------------- */

import { User } from "@token-rats/contracts";

describe("User contract — twitterVerified", () => {
  it("accepts a fully verified Twitter user", () => {
    const result = User.safeParse({
      id: "u1",
      handle: "vibedev",
      avatarUrl: null,
      twitterHandle: "vibedev",
      twitterVerified: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.twitterVerified).toBe(true);
      expect(result.data.twitterHandle).toBe("vibedev");
    }
  });

  it("accepts a user with no twitter linkage at all", () => {
    const result = User.safeParse({
      id: "u1",
      handle: "vibedev",
      avatarUrl: null,
    });
    expect(result.success).toBe(true);
  });

  it("treats twitterVerified=false as a valid unverified state", () => {
    const result = User.safeParse({
      id: "u1",
      handle: "vibedev",
      avatarUrl: null,
      twitterHandle: "manual",
      twitterVerified: false,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.twitterVerified).toBe(false);
  });
});
