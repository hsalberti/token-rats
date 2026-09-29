import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ApiClient } from "./api.js";
import {
  type PendingCaptures,
  globalInstructionFiles,
  pollSetupTracking,
  readInstructions,
  sanitizeInstructions,
  writeTracking,
} from "./setup-tracking.js";
let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "token-rats-capture-"));
  vi.stubEnv("XDG_CONFIG_HOME", join(dir, "config"));
  vi.stubEnv("CODEX_HOME", join(dir, "codex"));
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});
it("respects configured global locations and Codex override priority", () => {
  mkdirSync(join(dir, "codex"));
  mkdirSync(join(dir, "config", "opencode"), { recursive: true });
  writeFileSync(join(dir, "codex", "AGENTS.md"), "default");
  writeFileSync(join(dir, "codex", "AGENTS.override.md"), "override");
  writeFileSync(join(dir, "config", "opencode", "AGENTS.md"), "other");
  expect(globalInstructionFiles().map((f) => f.path)).toEqual([
    join(dir, "codex", "AGENTS.override.md"),
    join(dir, "config", "opencode", "AGENTS.md"),
  ]);
});
it("omits marked sections and credential lines, preserves instructions, and refuses incomplete exclusions", () => {
  const raw = [
    "# Review",
    "Use /home/test/project",
    "<!-- token-rats:private -->",
    "internal team instructions",
    "<!-- /token-rats:private -->",
    "api_key = abc123private",
    "Authorization: Bearer abcdefghijklmnopqrstuvwxyz",
    "-----BEGIN PRIVATE KEY-----",
    "key contents",
    "-----END PRIVATE KEY-----",
    "Run tests.",
  ].join("\r\n");
  const clean = sanitizeInstructions(raw, "/home/test");
  expect(clean).toContain("Use ~/project");
  expect(clean).toContain("Run tests.");
  expect(clean).not.toMatch(/internal team|abc123private|abcdefghijklmnopqrstuvwxyz|key contents/);
  expect(() => sanitizeInstructions("<!-- token-rats:private -->\nUnfinished")).toThrow(
    "Private section is not closed",
  );
});
it("coalesces atomic saves, skips remotely paused sources, and retries the latest sanitized content after a failed upload", async () => {
  const file = join(dir, "AGENTS.md");
  writeFileSync(file, "Initial\n");
  writeTracking([{ id: "source", path: file, label: "Test", enabled: true }]);
  let enabled = true;
  const get = vi.fn(async () => ({ watchers: [{ id: "source", enabled }] }));
  const post = vi.fn(async () => ({ changed: true }));
  const client = { get, post } as unknown as Pick<ApiClient, "get" | "post">;
  const pending: PendingCaptures = new Map();
  expect(await pollSetupTracking(client, pending, 0)).toBe(0);
  writeFileSync(
    `${file}.tmp`,
    "Updated\n<!-- token-rats:private -->\nLocal only\n<!-- /token-rats:private -->\n",
  );
  renameSync(`${file}.tmp`, file);
  await pollSetupTracking(client, pending, 500);
  await pollSetupTracking(client, pending, 1000);
  expect(post).toHaveBeenCalledTimes(2); // Heartbeats while the editor is still saving.
  post.mockRejectedValueOnce(Error("offline"));
  await expect(pollSetupTracking(client, pending, 3000)).rejects.toThrow("offline");
  expect(await pollSetupTracking(client, pending, 4000)).toBe(1);
  expect(post).toHaveBeenLastCalledWith("/v1/setups/watchers/source/sync", {
    content: "Updated\n",
  });
  enabled = false;
  post.mockClear();
  await pollSetupTracking(client, pending, 5000);
  expect(post).not.toHaveBeenCalled();
  enabled = true;
  writeFileSync(file, "<!-- token-rats:private -->\nunfinished");
  await pollSetupTracking(client, pending, 6000);
  expect(post).toHaveBeenLastCalledWith("/v1/setups/watchers/source/sync", {
    error: "Private section is not closed",
  });
  rmSync(file);
  await pollSetupTracking(client, pending, 7000);
  expect(post).toHaveBeenLastCalledWith("/v1/setups/watchers/source/sync", {
    error: "File missing",
  });
});
it("does not contact the API before opt-in and refuses oversized files", async () => {
  const get = vi.fn();
  const post = vi.fn();
  expect(await pollSetupTracking({ get, post }, new Map())).toBe(0);
  expect(get).not.toHaveBeenCalled();
  const file = join(dir, "AGENTS.md");
  writeFileSync(file, "x".repeat(20001));
  expect(() => readInstructions(file)).toThrow("File exceeds 20,000 characters");
});
