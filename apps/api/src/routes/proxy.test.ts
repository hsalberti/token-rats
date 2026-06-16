/**
 * Unit tests for the proxy SSE usage accumulator (apps/api/src/routes/proxy.ts).
 *
 * The streaming path forwards Anthropic's SSE byte-for-byte but inspects each
 * `data:` line to recover token counts. Anthropic splits usage across two
 * events — `message_start` (input_tokens) and `message_delta` (final
 * output_tokens) — and each field is authoritative on its own event, so
 * parseSSELine must OVERWRITE, never accumulate. These tests pin that.
 */

import { describe, expect, it } from "vitest";
import { type UsageAccumulator, parseSSELine } from "./proxy.js";

function fresh(): UsageAccumulator {
  return { input_tokens: 0, output_tokens: 0, model: "unknown" };
}

function dataLine(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}`;
}

describe("parseSSELine", () => {
  it("takes input_tokens from message_start and output_tokens from message_delta", () => {
    const acc = fresh();

    parseSSELine(
      dataLine({
        type: "message_start",
        message: { model: "claude-opus-4-7", usage: { input_tokens: 120, output_tokens: 1 } },
      }),
      acc,
    );
    parseSSELine(dataLine({ type: "message_delta", usage: { output_tokens: 350 } }), acc);

    expect(acc.model).toBe("claude-opus-4-7");
    expect(acc.input_tokens).toBe(120);
    // 350, NOT 351 — message_start's partial output (1) must not be added.
    expect(acc.output_tokens).toBe(350);
  });

  it("does not double-count when message_delta arrives multiple times", () => {
    const acc = fresh();

    parseSSELine(
      dataLine({
        type: "message_start",
        message: { model: "claude-opus-4-7", usage: { input_tokens: 50, output_tokens: 0 } },
      }),
      acc,
    );
    // Anthropic may emit several message_delta frames; the last one is final.
    parseSSELine(dataLine({ type: "message_delta", usage: { output_tokens: 10 } }), acc);
    parseSSELine(dataLine({ type: "message_delta", usage: { output_tokens: 200 } }), acc);

    expect(acc.input_tokens).toBe(50);
    expect(acc.output_tokens).toBe(200);
  });

  it("ignores content_block_delta and other non-usage events", () => {
    const acc = fresh();

    parseSSELine(
      dataLine({
        type: "message_start",
        message: { model: "claude-opus-4-7", usage: { input_tokens: 7 } },
      }),
      acc,
    );
    parseSSELine(dataLine({ type: "content_block_delta", delta: { text: "hi" } }), acc);
    parseSSELine(dataLine({ type: "ping" }), acc);
    parseSSELine(dataLine({ type: "message_delta", usage: { output_tokens: 42 } }), acc);

    expect(acc.input_tokens).toBe(7);
    expect(acc.output_tokens).toBe(42);
  });

  it("ignores non-data lines, [DONE], and malformed JSON", () => {
    const acc = fresh();

    parseSSELine("event: message_start", acc);
    parseSSELine("", acc);
    parseSSELine("data: [DONE]", acc);
    parseSSELine("data: {not valid json", acc);

    expect(acc.input_tokens).toBe(0);
    expect(acc.output_tokens).toBe(0);
    expect(acc.model).toBe("unknown");
  });
});
