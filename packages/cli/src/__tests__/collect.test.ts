import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createClaudeCodeParser, createCodexParser } from "@token-rats/parsers";
import { afterEach, describe, expect, it } from "vitest";
import { parseSessionFiles } from "../lib/collect.js";

const directories: string[] = [];
function files(contents: string[]): string[] {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "token-rats-stream-test-"));
  directories.push(directory);
  return contents.map((content, index) => {
    const file = path.join(directory, `${index}.jsonl`);
    fs.writeFileSync(file, content);
    return file;
  });
}
afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true });
});

describe("streaming log collection", () => {
  it("deduplicates Claude messages across files, including a final line without a newline", async () => {
    const message = (id: string, output: number, timestamp: number) =>
      JSON.stringify({
        type: "assistant",
        sessionId: "shared",
        timestamp,
        message: {
          id,
          model: "claude-sonnet-4",
          usage: { input_tokens: 10, output_tokens: output, cache_read_input_tokens: 100 },
        },
      });
    const records = await parseSessionFiles(
      files([
        `${message("a", 2, 1000)}\r\ninvalid JSON\r\n`,
        `${message("a", 5, 2000)}\n${message("b", 3, 3000)}`,
      ]),
      createClaudeCodeParser(),
    );
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      inTokens: 20,
      outTokens: 8,
      cacheReadTokens: 200,
      startedAt: 1000,
      endedAt: 3000,
    });
  });

  it("keeps the latest Codex snapshot and does not assign orphan events to another file", async () => {
    const meta = JSON.stringify({
      type: "session_meta",
      timestamp: 1000,
      payload: { id: "shared" },
    });
    const usage = (timestamp: number, output: number) =>
      JSON.stringify({
        type: "event_msg",
        timestamp,
        payload: {
          type: "token_count",
          info: {
            total_token_usage: {
              input_tokens: 100,
              cached_input_tokens: 70,
              output_tokens: output,
              reasoning_output_tokens: 2,
            },
          },
        },
      });
    const records = await parseSessionFiles(
      files([`${meta}\n${usage(3000, 8)}`, `${meta}\n${usage(2000, 5)}`, usage(4000, 99)]),
      createCodexParser(),
    );
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      inTokens: 30,
      outTokens: 8,
      reasoningTokens: 2,
      endedAt: 3000,
    });
  });

  it("rejects an unreadable snapshot instead of returning incomplete totals", async () => {
    const [file] = files([""]);
    fs.unlinkSync(file!);
    await expect(parseSessionFiles([file!], createClaudeCodeParser())).rejects.toThrow();
  });
});
