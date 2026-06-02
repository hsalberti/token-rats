import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseClaudeCode } from "./claude-code.js";
import { parseCodex } from "./codex.js";
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

    it("sums uncached input_tokens only (matches Claude Code /stats)", () => {
      // turn 1: input=100 → 100
      // turn 2: input=200 → 200
      // cache_creation/cache_read are deliberately excluded
      expect(rec.inTokens).toBe(300);
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

    it("tags provider as anthropic", () => {
      expect(rec.provider).toBe("anthropic");
    });

    it("tags client + channel for Claude Code CLI sessions", () => {
      expect(rec.client).toBe("claude-code");
      expect(rec.channel).toBe("cli");
    });

    it("reports cache read + write tokens separately from inTokens", () => {
      // turn 1: cache_read=0,   cache_creation=0
      // turn 2: cache_read=250, cache_creation=500
      // Headline inTokens (300) deliberately excludes these.
      expect(rec.cacheReadTokens).toBe(250);
      expect(rec.cacheWriteTokens).toBe(500);
    });
  });

  describe("session-bbb-222 (includes malformed line and unknown model)", () => {
    const rec = records.find((r) => r.id === "claude-code:session-bbb-222")!;

    it("is defined (malformed line did not crash parser)", () => {
      expect(rec).toBeDefined();
    });

    it("sums tokens across multiple assistant turns including unknown-model turn", () => {
      // turn 1: input=80 → 80; out=20  (cacheRead=100 ignored)
      // turn 2 (unknown-model): input=50 → 50; out=10
      // turn 3: input=40 → 40; out=15
      // total in=170, out=45
      expect(rec.inTokens).toBe(170);
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

  it("emits one record per composer generation, skipping other types", () => {
    // Fixture: 2× composer, 1× tab, 1× unknown — only the composers should survive
    expect(records).toHaveLength(2);
    expect(records.every((r) => r.source === "cursor")).toBe(true);
  });

  it("ids are prefixed with cursor:", () => {
    expect(records.map((r) => r.id).sort()).toEqual([
      "cursor:cursor-gen-001",
      "cursor:cursor-gen-002",
    ]);
  });

  it("tags model as cursor-composer", () => {
    expect(records.every((r) => r.model === "cursor-composer")).toBe(true);
  });

  it("tags client + channel as cursor / ide", () => {
    expect(records.every((r) => r.client === "cursor")).toBe(true);
    expect(records.every((r) => r.channel === "ide")).toBe(true);
  });

  describe("token + cost estimation", () => {
    it("estimates 10k input / 2k output per composer generation", () => {
      const rec = records[0]!;
      expect(rec.inTokens).toBe(10_000);
      expect(rec.outTokens).toBe(2_000);
    });

    it("leaves cost at 0 — server stamps it from the D1 price catalog", () => {
      // Cost computation moved into apps/api/src/lib/pricing.ts; the parser
      // intentionally emits 0 and the server overwrites at ingest time.
      const rec = records[0]!;
      expect(rec.costUsdCents).toBe(0);
    });
  });

  describe("timestamps", () => {
    it("sets startedAt and endedAt to unixMs", () => {
      const rec = records.find((r) => r.id === "cursor:cursor-gen-001")!;
      expect(rec.startedAt).toBe(1700005000000);
      expect(rec.endedAt).toBe(1700005000000);
    });
  });

  describe("filtering", () => {
    it("skips tab events (autocomplete is excluded by design)", () => {
      expect(records.some((r) => r.id === "cursor:cursor-gen-003")).toBe(false);
    });

    it("skips unknown types (forward-compatible)", () => {
      expect(records.some((r) => r.id === "cursor:cursor-gen-004")).toBe(false);
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

  it("ignores rows missing required fields", () => {
    const r = parseCursor(
      JSON.stringify([
        { type: "composer", unixMs: 1700000000000 }, // no id
        { id: "x", unixMs: 1700000000000 }, // no type
        { id: "y", type: "composer" }, // no unixMs
        { id: "z", type: "composer", unixMs: 1700000000000 }, // valid
      ]),
    );
    expect(r).toHaveLength(1);
    expect(r[0]!.id).toBe("cursor:z");
  });
});

// ---------------------------------------------------------------------------
// Codex parser tests
// ---------------------------------------------------------------------------

describe("parseCodex", () => {
  const input = readFixture("codex-sample.jsonl");
  const records = parseCodex(input);

  it("parses exactly two distinct sessions", () => {
    expect(records).toHaveLength(2);
  });

  it("ids are prefixed with codex:", () => {
    const ids = records.map((r) => r.id).sort();
    expect(ids).toEqual([
      "codex:019db29c-18c6-78a1-9d09-788e5b17fa5d",
      "codex:019db2eb-b85f-7563-a7e8-dec676161620",
    ]);
  });

  it("source is codex for all records", () => {
    expect(records.every((r) => r.source === "codex")).toBe(true);
  });

  describe("session 019db29c (gpt-5.3-codex)", () => {
    const rec = records.find((r) => r.id === "codex:019db29c-18c6-78a1-9d09-788e5b17fa5d")!;

    it("inTokens = input_tokens − cached_input_tokens (last cumulative)", () => {
      // Final total_token_usage: input=40000, cached=35000 → 5000 uncached.
      expect(rec.inTokens).toBe(5000);
    });

    it("outTokens = output_tokens + reasoning_output_tokens (last cumulative)", () => {
      // Final: output=500, reasoning=200 → 700.
      expect(rec.outTokens).toBe(700);
    });

    it("model is from turn_context", () => {
      expect(rec.model).toBe("gpt-5.3-codex");
    });

    it("startedAt is session_meta.payload.timestamp", () => {
      expect(rec.startedAt).toBe(Date.parse("2026-04-22T00:34:27.656Z"));
    });

    it("endedAt is latest event timestamp", () => {
      expect(rec.endedAt).toBe(Date.parse("2026-04-22T00:50:01.000Z"));
    });

    it("dedupeKey is a non-empty hex string", () => {
      expect(rec.dedupeKey).toMatch(/^[0-9a-f]+$/);
    });

    it("tags provider as openai", () => {
      expect(rec.provider).toBe("openai");
    });

    it("tags Codex CLI sessions distinctly from the coarse source bucket", () => {
      expect(rec.client).toBe("codex-cli");
      expect(rec.channel).toBe("cli");
    });

    it("reports cached input + reasoning tokens separately from headline", () => {
      // Final total: cached_input=35000, reasoning_output=200
      expect(rec.cacheReadTokens).toBe(35_000);
      expect(rec.reasoningTokens).toBe(200);
    });
  });

  describe("session 019db2eb (gpt-5-mini)", () => {
    const rec = records.find((r) => r.id === "codex:019db2eb-b85f-7563-a7e8-dec676161620")!;

    it("uses cumulative totals from the final token_count", () => {
      // Final: input=2500, cached=500 → 2000 uncached; output=400+50=450.
      expect(rec.inTokens).toBe(2000);
      expect(rec.outTokens).toBe(450);
    });

    it("model is gpt-5-mini", () => {
      expect(rec.model).toBe("gpt-5-mini");
    });
  });

  it("returns empty array for empty input", () => {
    expect(parseCodex("")).toHaveLength(0);
  });

  it("skips malformed lines without crashing", () => {
    expect(parseCodex("garbage\nmore garbage\n").length).toBe(0);
  });

  it("parses identically when input is a Uint8Array", () => {
    const bytes = new TextEncoder().encode(input);
    const fromBytes = parseCodex(bytes);
    expect(fromBytes).toHaveLength(records.length);
    expect(fromBytes.map((r) => r.id).sort()).toEqual(records.map((r) => r.id).sort());
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
    const base = computeDedupeKey(
      "claude-code",
      "claude-3-5-sonnet-20241022",
      1700000000,
      1050,
      350,
    );
    const diffSource = computeDedupeKey(
      "cursor",
      "claude-3-5-sonnet-20241022",
      1700000000,
      1050,
      350,
    );
    const diffModel = computeDedupeKey(
      "claude-code",
      "claude-3-haiku-20240307",
      1700000000,
      1050,
      350,
    );
    const diffTime = computeDedupeKey(
      "claude-code",
      "claude-3-5-sonnet-20241022",
      1700000001,
      1050,
      350,
    );
    const diffIn = computeDedupeKey(
      "claude-code",
      "claude-3-5-sonnet-20241022",
      1700000000,
      1051,
      350,
    );
    const diffOut = computeDedupeKey(
      "claude-code",
      "claude-3-5-sonnet-20241022",
      1700000000,
      1050,
      351,
    );

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
