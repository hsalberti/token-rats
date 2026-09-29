import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { SetupWatcher } from "@token-rats/contracts";
import type { ApiClient } from "./api.js";

export interface TrackedSource {
  id: string;
  path: string;
  label: string;
  enabled: boolean;
}
export function trackingPath() {
  return join(
    process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"),
    "token-rats",
    "setup-tracking.json",
  );
}
export function readTracking(): TrackedSource[] {
  if (!existsSync(trackingPath())) return [];
  const data = JSON.parse(readFileSync(trackingPath(), "utf8"));
  if (
    !Array.isArray(data.sources) ||
    !data.sources.every(
      (s: Partial<TrackedSource>) =>
        s &&
        typeof s.id === "string" &&
        typeof s.path === "string" &&
        typeof s.label === "string" &&
        typeof s.enabled === "boolean",
    )
  )
    throw Error("Invalid setup tracking file. Run setup-track to review it.");
  return data.sources;
}
export function writeTracking(sources: TrackedSource[]) {
  const file = trackingPath();
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify({ sources }, null, 2), { mode: 0o600 });
  renameSync(temp, file);
}
export function globalInstructionFiles(): { path: string; label: string }[] {
  const codex = process.env.CODEX_HOME ?? join(homedir(), ".codex");
  const override = join(codex, "AGENTS.override.md");
  return [
    { path: existsSync(override) ? override : join(codex, "AGENTS.md"), label: "Codex global" },
    {
      path: join(
        process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"),
        "opencode",
        "AGENTS.md",
      ),
      label: "OpenCode global",
    },
  ]
    .filter((f) => existsSync(f.path))
    .map((f) => ({ ...f, path: resolve(f.path) }));
}
export function sanitizeInstructions(raw: string, home = homedir()): string {
  let privateBlock = false;
  let keyBlock = false;
  const lines = [];
  for (const line of raw.replace(/\r\n?/g, "\n").split("\n")) {
    if (line.includes("<!-- token-rats:private -->")) {
      privateBlock = true;
      continue;
    }
    if (line.includes("<!-- /token-rats:private -->")) {
      privateBlock = false;
      continue;
    }
    if (privateBlock) continue;
    if (/-----BEGIN .*PRIVATE KEY-----/.test(line)) {
      keyBlock = true;
      lines.push("[Private key omitted]");
      continue;
    }
    if (keyBlock) {
      if (/-----END .*PRIVATE KEY-----/.test(line)) keyBlock = false;
      continue;
    }
    if (
      /\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]+|AKIA[A-Z0-9]{16})\b/.test(
        line,
      ) ||
      /(?:api[_-]?key|access[_-]?token|secret|password)\s*[=:]\s*["']?\S{6,}/i.test(line) ||
      /Bearer\s+[A-Za-z0-9._-]{20,}/i.test(line)
    ) {
      lines.push("[Credential line omitted]");
      continue;
    }
    lines.push(
      line
        .split(home)
        .join("~")
        // biome-ignore lint/suspicious/noControlCharactersInRegex: remove terminal control bytes from shared text.
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ""),
    );
  }
  if (privateBlock) throw Error("Private section is not closed");
  return lines.join("\n");
}
export function readInstructions(file: string): string {
  if (!existsSync(file)) throw Error("File missing");
  let raw: string;
  try {
    if (statSync(file).size > 80_000) throw Error("File exceeds 20,000 characters");
    raw = readFileSync(file, "utf8");
  } catch (e) {
    if ((e as Error).message === "File exceeds 20,000 characters") throw e;
    throw Error("Cannot read file");
  }
  const content = sanitizeInstructions(raw);
  if (content.length > 20000) throw Error("File exceeds 20,000 characters");
  return content;
}
type Client = Pick<ApiClient, "get" | "post">;
export type PendingCaptures = Map<string, { hash: string; since: number }>;
/** Polling survives atomic editor saves; two stable observations coalesce rapid edits. */
export async function pollSetupTracking(
  client: Client,
  pending: PendingCaptures,
  now = Date.now(),
): Promise<number> {
  const sources = readTracking().filter((s) => s.enabled);
  if (!sources.length) return 0;
  const { watchers } = await client.get<{ watchers: SetupWatcher[] }>("/v1/setups/watchers");
  let saved = 0;
  for (const source of sources) {
    const remote = watchers.find((w) => w.id === source.id);
    if (!remote?.enabled) {
      pending.delete(source.id);
      continue;
    }
    let content: string;
    try {
      content = readInstructions(source.path);
    } catch (e) {
      pending.delete(source.id);
      await client.post(`/v1/setups/watchers/${source.id}/sync`, { error: (e as Error).message });
      continue;
    }
    const hash = createHash("sha256").update(content).digest("hex");
    const observed = pending.get(source.id);
    if (!observed || observed.hash !== hash) {
      pending.set(source.id, { hash, since: now });
      await client.post(`/v1/setups/watchers/${source.id}/sync`, {});
      continue;
    }
    if (now - observed.since < 1500) continue;
    const result = await client.post<{ changed: boolean }>(
      `/v1/setups/watchers/${source.id}/sync`,
      { content },
    );
    if (result.changed) saved++;
  }
  return saved;
}
