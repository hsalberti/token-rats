import { describe, expect, it } from "vitest";
import { priceOf } from "./index.js";

describe("priceOf", () => {
  it("prices a known model exactly", () => {
    const r = priceOf("claude-sonnet-4-6", 1_000_000, 1_000_000);
    expect(r.known).toBe(true);
    expect(r.costUsdCents).toBe(1800); // $3 + $15 = $18 = 1800 cents
  });

  it("matches by prefix for date-suffixed variants", () => {
    const r = priceOf("claude-opus-4-7-20260101", 1_000_000, 0);
    expect(r.known).toBe(true);
    expect(r.costUsdCents).toBe(1500); // $15 input
  });

  it("returns zero cost (known=false) for unknown models", () => {
    const r = priceOf("totally-fake-model", 100, 200);
    expect(r.known).toBe(false);
    expect(r.costUsdCents).toBe(0);
  });
});
