/**
 * Unit tests for the deep health probe.
 *
 * D1/KV are stubbed with the minimal surface `checkHealth` touches — a
 * `prepare().first()` chain and a `get()`. No network, no miniflare.
 */

import { describe, expect, it } from "vitest";
import type { Env } from "../env.js";
import { WORKER_VERSION } from "../version.js";
import { checkHealth } from "./health.js";

function envWith(opts: { db: "ok" | "throw"; kv: "ok" | "throw" }): Env {
  const db = {
    prepare: () => ({
      first: async () => {
        if (opts.db === "throw") throw new Error("db down");
        return { 1: 1 };
      },
    }),
  };
  const cache = {
    get: async () => {
      if (opts.kv === "throw") throw new Error("kv down");
      return null;
    },
  };
  return { DB: db, CACHE: cache } as unknown as Env;
}

describe("checkHealth", () => {
  it("reports ok when both deps respond", async () => {
    const report = await checkHealth(envWith({ db: "ok", kv: "ok" }));
    expect(report).toEqual({ ok: true, db: true, kv: true, version: WORKER_VERSION });
  });

  it("reports not-ok with db=false when the D1 probe throws", async () => {
    const report = await checkHealth(envWith({ db: "throw", kv: "ok" }));
    expect(report.ok).toBe(false);
    expect(report.db).toBe(false);
    expect(report.kv).toBe(true);
  });

  it("reports not-ok with kv=false when the KV probe throws", async () => {
    const report = await checkHealth(envWith({ db: "ok", kv: "throw" }));
    expect(report.ok).toBe(false);
    expect(report.db).toBe(true);
    expect(report.kv).toBe(false);
  });
});
