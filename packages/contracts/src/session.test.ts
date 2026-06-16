import { describe, expect, it } from "vitest";
import { SessionRecord } from "./session.js";

/** A valid record mirroring what the parsers emit today. */
function makeRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "claude-code:8f3c1a2b-0e4d-4f9a-9c1e-2b3d4e5f6071",
    source: "claude-code",
    model: "claude-3-5-sonnet-20241022",
    inTokens: 100,
    outTokens: 50,
    costUsdCents: 0,
    startedAt: 1_700_000_000_000,
    endedAt: 1_700_000_060_000,
    dedupeKey: "9af12c0e",
    ...overrides,
  };
}

describe("SessionRecord field bounds", () => {
  it("accepts the shapes the parsers emit", () => {
    expect(SessionRecord.safeParse(makeRecord()).success).toBe(true);
    // vendor-slug models with dot / slash
    expect(
      SessionRecord.safeParse(makeRecord({ model: "anthropic/claude-opus-4.7" })).success,
    ).toBe(true);
    expect(SessionRecord.safeParse(makeRecord({ model: "gpt-5.3-codex" })).success).toBe(true);
    expect(SessionRecord.safeParse(makeRecord({ model: "cursor-composer" })).success).toBe(true);
    // cursor id shape + optional client slug
    expect(
      SessionRecord.safeParse(makeRecord({ id: "cursor:0a1b2c3d", client: "token-rats-proxy" }))
        .success,
    ).toBe(true);
  });

  it("rejects over-length values", () => {
    expect(SessionRecord.safeParse(makeRecord({ id: "x".repeat(257) })).success).toBe(false);
    expect(SessionRecord.safeParse(makeRecord({ model: "x".repeat(129) })).success).toBe(false);
    expect(SessionRecord.safeParse(makeRecord({ dedupeKey: "a".repeat(129) })).success).toBe(false);
    expect(SessionRecord.safeParse(makeRecord({ client: "x".repeat(65) })).success).toBe(false);
  });

  it("rejects control characters and disallowed charset", () => {
    expect(SessionRecord.safeParse(makeRecord({ id: "bad\nid" })).success).toBe(false);
    expect(SessionRecord.safeParse(makeRecord({ model: "model\t" })).success).toBe(false);
    expect(SessionRecord.safeParse(makeRecord({ dedupeKey: "has space" })).success).toBe(false);
    expect(SessionRecord.safeParse(makeRecord({ client: "has space" })).success).toBe(false);
  });

  it("still requires non-empty values", () => {
    expect(SessionRecord.safeParse(makeRecord({ id: "" })).success).toBe(false);
    expect(SessionRecord.safeParse(makeRecord({ model: "" })).success).toBe(false);
    expect(SessionRecord.safeParse(makeRecord({ dedupeKey: "" })).success).toBe(false);
  });
});
