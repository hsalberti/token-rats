import { PatchMeRequest } from "@token-rats/contracts";
/**
 * Unit tests for the PATCH /v1/me validation schema (PatchMeRequest).
 *
 * These test the Zod schema in isolation — no network, no D1.
 */
import { describe, expect, it } from "vitest";

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

  // v1.2: twitterHandle is no longer a mutable field on PATCH /v1/me —
  // the only way to set it is the X OAuth flow, and the only way to clear
  // it is POST /v1/me/twitter/disconnect. Zod strips extra keys by default,
  // so passing twitterHandle is now silently ignored.
  it("strips twitterHandle from the parsed body", () => {
    const result = PatchMeRequest.safeParse({ twitterHandle: "vibedev" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).twitterHandle).toBeUndefined();
    }
  });

  it("accepts the two valid fields together", () => {
    const result = PatchMeRequest.safeParse({
      publicProfile: true,
      bio: "Shipping fast",
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-boolean publicProfile", () => {
    const result = PatchMeRequest.safeParse({ publicProfile: "yes" });
    expect(result.success).toBe(false);
  });
});
