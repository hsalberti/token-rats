/**
 * Deep health probe shared by `GET /healthz` and the canary cron.
 *
 * Each dependency check races a short timeout so a hung binding can't stall
 * the whole probe. `db`/`kv` are booleans; `ok` is their conjunction.
 */

import type { Env } from "../env.js";
import { WORKER_VERSION } from "../version.js";

export type HealthReport = {
  ok: boolean;
  db: boolean;
  kv: boolean;
  version: string;
};

const PROBE_TIMEOUT_MS = 2000;

/** Sentinel key the KV probe reads. A miss (null) still proves connectivity. */
const KV_PROBE_KEY = "healthz:probe";

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return await Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("health probe timeout")), ms)),
  ]);
}

async function checkDb(env: Env): Promise<boolean> {
  try {
    await withTimeout(env.DB.prepare("SELECT 1").first(), PROBE_TIMEOUT_MS);
    return true;
  } catch (err) {
    console.error("[healthz] db probe failed", err);
    return false;
  }
}

async function checkKv(env: Env): Promise<boolean> {
  try {
    await withTimeout(env.CACHE.get(KV_PROBE_KEY), PROBE_TIMEOUT_MS);
    return true;
  } catch (err) {
    console.error("[healthz] kv probe failed", err);
    return false;
  }
}

/** Run all dependency probes and return a report. Never throws. */
export async function checkHealth(env: Env): Promise<HealthReport> {
  const [db, kv] = await Promise.all([checkDb(env), checkKv(env)]);
  return { ok: db && kv, db, kv, version: WORKER_VERSION };
}
