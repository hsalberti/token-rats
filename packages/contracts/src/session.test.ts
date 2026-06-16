/**
 * SessionRecord contract tests.
 *
 * Two concerns live here:
 *  - Field bounds: the `.max()` + charset guards on id/model/dedupeKey/client
 *    accept every shape the parsers emit while rejecting blobs / control chars.
 *  - Back-compat: the CLI ships independently of the API, so an old binary keeps
 *    POSTing the v0-shaped record (no `provider`, no `client`/`channel`, no
 *    granular cache / reasoning token fields) long after newer fields land.
 *    These tests pin both the v0 shape and the current shape so a future edit
 *    can't silently make the optional fields required and start 400-ing old
 *    clients.
 */

import { describe, expect, it } from "vitest";
import { UploadSessionsRequest } from "./api.js";
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

/** The exact JSON an old (pre-0013 contracts) CLI emits. */
const v0Record = {
  id: "sess-v0-1",
  source: "claude-code",
  model: "claude-3-5-sonnet-20241022",
  inTokens: 1200,
  outTokens: 340,
  costUsdCents: 0,
  startedAt: 1_718_445_600_000,
  endedAt: 1_718_445_660_000,
  dedupeKey: "v0-hash-abc",
};

/** A current-shape record carrying every field a modern CLI sends. */
const currentRecord = {
  id: "sess-cur-1",
  source: "codex",
  provider: "openai",
  client: "codex-cli",
  channel: "cli",
  model: "gpt-5.3-codex",
  inTokens: 2000,
  outTokens: 800,
  cacheReadTokens: 12_000,
  cacheWriteTokens: 800,
  reasoningTokens: 256,
  costUsdCents: 0,
  startedAt: 1_718_532_000_000,
  endedAt: 1_718_532_120_000,
  dedupeKey: "cur-hash-xyz",
};

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

describe("SessionRecord back-compat", () => {
  it("parses a v0-shaped record and leaves the new fields undefined", () => {
    const parsed = SessionRecord.parse(v0Record);
    expect(parsed.provider).toBeUndefined();
    expect(parsed.client).toBeUndefined();
    expect(parsed.channel).toBeUndefined();
    expect(parsed.cacheReadTokens).toBeUndefined();
    expect(parsed.cacheWriteTokens).toBeUndefined();
    expect(parsed.reasoningTokens).toBeUndefined();
    // Round-trips without re-shaping the known fields.
    expect(parsed).toMatchObject({
      id: "sess-v0-1",
      source: "claude-code",
      model: "claude-3-5-sonnet-20241022",
      inTokens: 1200,
      outTokens: 340,
    });
  });

  it("parses a current-shape record with every field present", () => {
    const parsed = SessionRecord.parse(currentRecord);
    expect(parsed.provider).toBe("openai");
    expect(parsed.client).toBe("codex-cli");
    expect(parsed.channel).toBe("cli");
    expect(parsed.cacheReadTokens).toBe(12_000);
    expect(parsed.reasoningTokens).toBe(256);
  });

  it("rejects a record missing a required field", () => {
    const { dedupeKey, ...missing } = v0Record;
    expect(() => SessionRecord.parse(missing)).toThrow();
  });
});

describe("UploadSessionsRequest round-trip", () => {
  it("accepts a mixed batch of v0 and current records", () => {
    const req = UploadSessionsRequest.parse({ sessions: [v0Record, currentRecord] });
    expect(req.sessions).toHaveLength(2);
    expect(req.sessions[0]?.id).toBe("sess-v0-1");
    expect(req.sessions[1]?.id).toBe("sess-cur-1");
  });

  it("accepts an empty batch (heartbeat upload)", () => {
    const req = UploadSessionsRequest.parse({ sessions: [] });
    expect(req.sessions).toEqual([]);
  });

  it("round-trips a parsed batch back through the schema unchanged", () => {
    const first = UploadSessionsRequest.parse({ sessions: [v0Record, currentRecord] });
    const second = UploadSessionsRequest.parse(first);
    expect(second).toEqual(first);
  });

  it("rejects a batch over the 1000-record cap", () => {
    const sessions = Array.from({ length: 1001 }, (_, i) => ({
      ...v0Record,
      id: `sess-${i}`,
      dedupeKey: `hash-${i}`,
    }));
    expect(() => UploadSessionsRequest.parse({ sessions })).toThrow();
  });
});
