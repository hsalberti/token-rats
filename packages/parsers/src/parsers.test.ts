import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { parseClaudeCode } from "./claude-code.js";
import { parseCursor } from "./cursor.js";
import { computeDedupeKey, fnv1aHex } from "./hash.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = join(__dirname, "__fixtures__");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readFixture(name: string): string {
  return readFileSync(join(fixtures, name), "utf-8");
}

// ---------------------------------------------------------------------------
// Claude Code parser tests
// ---------------------------------------------------------------------------

describe("parseClaudeCode", () => {
  const input = readFixture("claude-code-sample.jsonl");
  const records = parseClaudeCode(input);

  it("parses exactly two distinct sessions", () => {
    expect(records).toHaveLength(2);
  });

  it("assigns correct ids", () => {
    const ids = records.map((r) => r.id).sort();
    expect(ids).toEqual(["claude-code:session-aaa-111", "claude-code:session-bbb-222"]);
  });

  it("source is claude-code for all records", () => {
    expect(records.every((r) => r.source === "claude-code")).toBe(true);
  });

  describe("session-aaa-111", () => {
    const rec = records.find((r) => r.id === "claude-code:session-aaa-111")!;

    it("sums regular input + cache_creation + cache_read as inTokens", () => {
      // turn 1: input=100, cacheCreate=0, cacheRead=0   → 100
      // turn 2: input=200, cacheCreate=500, cacheRead=250 → 950
      // total = 1050
      expect(rec.inTokens).toBe(1050);
    });

    it("sums output tokens across turns", () => {
      // 50 + 300 = 350
      expect(rec.outTokens).toBe(350);
    });

    it("uses model from last assistant message", () => {
      expect(rec.model).toBe("claude-3-5-sonnet-20241022");
    });

    it("startedAt is earliest timestamp", () => {
      expect(rec.startedAt).toBe(1700000000000);
    });

    it("endedAt is latest timestamp", () => {
      expect(rec.endedAt).toBe(1700000003000);
    });

    it("has a non-empty dedupeKey", () => {
      expect(rec.dedupeKey).toMatch(/^[0-9a-f]+$/);
    });

    it("costUsdCents is a non-negative integer", () => {
      expect(rec.costUsdCents).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(rec.costUsdCents)).toBe(true);
    });
  });

  describe("session-bbb-222 (includes malformed line and unknown model)", () => {
    const rec = records.find((r) => r.id === "claude-code:session-bbb-222")!;

    it("is defined (malformed line did not crash parser)", () => {
      expect(rec).toBeDefined();
    });

    it("sums tokens across multiple assistant turns including unknown-model turn", () => {
      // turn 1: input=80, cacheRead=100 → 180; out=20
      // turn 2 (unknown-model): input=50 → 50; out=10
      // turn 3: input=40 → 40; out=15
      // total in=270, out=45
      expect(rec.inTokens).toBe(270);
      expect(rec.outTokens).toBe(45);
    });

    it("uses model from last assistant message (claude-3-5-haiku-20241022)", () => {
      // The last assistant turn in session-bbb-222 uses claude-3-5-haiku-20241022
      expect(rec.model).toBe("claude-3-5-haiku-20241022");
    });

    it("startedAt is earliest timestamp in session", () => {
      expect(rec.startedAt).toBe(1700001000000);
    });

    it("endedAt is latest timestamp in session", () => {
      expect(rec.endedAt).toBe(1700001003000);
    });
  });

  it("parses identically when input is a Uint8Array", () => {
    const bytes = new TextEncoder().encode(input);
    const recordsFromBytes = parseClaudeCode(bytes);
    // Same number of sessions
    expect(recordsFromBytes).toHaveLength(records.length);
    // Same ids
    const ids1 = records.map((r) => r.id).sort();
    const ids2 = recordsFromBytes.map((r) => r.id).sort();
    expect(ids2).toEqual(ids1);
  });

  it("returns empty array for empty input", () => {
    expect(parseClaudeCode("")).toHaveLength(0);
  });

  it("returns empty array when all lines are malformed", () => {
    expect(parseClaudeCode("not json\nalso bad\n")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Cursor parser tests
// ---------------------------------------------------------------------------

describe("parseCursor", () => {
  const input = readFixture("cursor-sample.json");
  const records = parseCursor(input);

  it("returns one record per row (3 records)", () => {
    expect(records).toHaveLength(3);
  });

  it("source is cursor for all records", () => {
    expect(records.every((r) => r.source === "cursor")).toBe(true);
  });

  it("ids are prefixed with cursor:", () => {
    expect(records.map((r) => r.id).sort()).toEqual([
      "cursor:cursor-req-001",
      "cursor:cursor-req-002",
      "cursor:cursor-req-003",
    ]);
  });

  describe("model name mapping", () => {
    it("maps claude-3.5-sonnet → claude-3-5-sonnet-20241022", () => {
      const rec = records.find((r) => r.id === "cursor:cursor-req-001")!;
      expect(rec.model).toBe("claude-3-5-sonnet-20241022");
    });

    it("leaves known canonical model names unchanged (gpt-4o)", () => {
      const rec = records.find((r) => r.id === "cursor:cursor-req-002")!;
      expect(rec.model).toBe("gpt-4o");
    });

    it("passes unknown model through unchanged", () => {
      const rec = records.find((r) => r.id === "cursor:cursor-req-003")!;
      expect(rec.model).toBe("some-totally-unknown-model");
    });

    it("sets costUsdCents to 0 for unknown model", () => {
      const rec = records.find((r) => r.id === "cursor:cursor-req-003")!;
      expect(rec.costUsdCents).toBe(0);
    });
  });

  describe("token counts", () => {
    it("maps promptTokens → inTokens", () => {
      const rec = records.find((r) => r.id === "cursor:cursor-req-001")!;
      expect(rec.inTokens).toBe(1200);
    });

    it("maps completionTokens → outTokens", () => {
      const rec = records.find((r) => r.id === "cursor:cursor-req-001")!;
      expect(rec.outTokens).toBe(450);
    });
  });

  describe("timestamps", () => {
    it("preserves startedAt", () => {
      const rec = records.find((r) => r.id === "cursor:cursor-req-001")!;
      expect(rec.startedAt).toBe(1700005000000);
    });

    it("preserves endedAt", () => {
      const rec = records.find((r) => r.id === "cursor:cursor-req-001")!;
      expect(rec.endedAt).toBe(1700005004500);
    });
  });

  it("parses identically when input is a Uint8Array", () => {
    const bytes = new TextEncoder().encode(input);
    const fromBytes = parseCursor(bytes);
    expect(fromBytes).toHaveLength(records.length);
    expect(fromBytes.map((r) => r.id).sort()).toEqual(records.map((r) => r.id).sort());
  });

  it("returns empty array for empty input", () => {
    expect(parseCursor("")).toHaveLength(0);
  });

  it("returns empty array for invalid JSON", () => {
    expect(parseCursor("not json at all")).toHaveLength(0);
  });

  it("returns empty array for JSON non-array (object)", () => {
    expect(parseCursor('{"id": "x"}')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// dedupeKey stability tests
// ---------------------------------------------------------------------------

describe("dedupeKey determinism", () => {
  it("computeDedupeKey is stable across calls", () => {
    const a = computeDedupeKey("claude-code", "claude-3-5-sonnet-20241022", 1700000000, 1050, 350);
    const b = computeDedupeKey("claude-code", "claude-3-5-sonnet-20241022", 1700000000, 1050, 350);
    expect(a).toBe(b);
  });

  it("dedupeKey changes when any field changes", () => {
    const base = computeDedupeKey("claude-code", "claude-3-5-sonnet-20241022", 1700000000, 1050, 350);
    const diffSource = computeDedupeKey("cursor", "claude-3-5-sonnet-20241022", 1700000000, 1050, 350);
    const diffModel = computeDedupeKey("claude-code", "claude-3-haiku-20240307", 1700000000, 1050, 350);
    const diffTime = computeDedupeKey("claude-code", "claude-3-5-sonnet-20241022", 1700000001, 1050, 350);
    const diffIn = computeDedupeKey("claude-code", "claude-3-5-sonnet-20241022", 1700000000, 1051, 350);
    const diffOut = computeDedupeKey("claude-code", "claude-3-5-sonnet-20241022", 1700000000, 1050, 351);

    expect(diffSource).not.toBe(base);
    expect(diffModel).not.toBe(base);
    expect(diffTime).not.toBe(base);
    expect(diffIn).not.toBe(base);
    expect(diffOut).not.toBe(base);
  });

  it("dedupeKey from parseClaudeCode is stable across re-runs", () => {
    const input = readFixture("claude-code-sample.jsonl");
    const run1 = parseClaudeCode(input);
    const run2 = parseClaudeCode(input);
    const keys1 = run1.map((r) => r.dedupeKey).sort();
    const keys2 = run2.map((r) => r.dedupeKey).sort();
    expect(keys1).toEqual(keys2);
  });

  it("dedupeKey from parseCursor is stable across re-runs", () => {
    const input = readFixture("cursor-sample.json");
    const run1 = parseCursor(input);
    const run2 = parseCursor(input);
    const keys1 = run1.map((r) => r.dedupeKey).sort();
    const keys2 = run2.map((r) => r.dedupeKey).sort();
    expect(keys1).toEqual(keys2);
  });

  it("fnv1aHex returns an 8-character lowercase hex string", () => {
    const h = fnv1aHex("hello world");
    expect(h).toMatch(/^[0-9a-f]{8}$/);
  });
});
