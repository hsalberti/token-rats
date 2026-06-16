/**
 * Scheduled handler for Token Rats Worker.
 *
 * Wired into apps/api/src/index.ts via the default export:
 *
 *   async scheduled(event, env, ctx) {
 *     ctx.waitUntil(runScheduled(event, env));
 *   }
 *
 * Multiple crons share this dispatcher — `event.cron` (the literal cron
 * expression from wrangler.toml) selects which handler runs. New crons added
 * to `[triggers].crons` need a matching case below.
 */

import type { Env } from "./env.js";
import { refreshPrices } from "./lib/price-refresh.js";

const WEEKLY_DIGEST_CRON = "0 16 * * 1";
const DAILY_PRICE_REFRESH_CRON = "0 4 * * *";
const CANARY_CRON = "*/5 * * * *";

/** Public origin the canary probes. Matches the custom domain in wrangler.toml. */
const CANARY_BASE_URL = "https://api.tokenrats.com";

/** Endpoints the canary hits every 5 minutes. Deep health first, then a couple
 *  of unauthenticated read paths that exercise the D1 read path end to end. */
const CANARY_TARGETS = ["/healthz", "/v1/trending", "/v1/cli/version"];

const CANARY_FETCH_TIMEOUT_MS = 5000;

/** Fire a short alert to the Discord webhook. No-op when the secret is unset. */
async function sendDiscordAlert(env: Env, content: string): Promise<void> {
  if (!env.DISCORD_ALERT_WEBHOOK) return;
  try {
    await fetch(env.DISCORD_ALERT_WEBHOOK, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content }),
    });
  } catch (err) {
    console.error("[scheduled] canary alert post failed", err);
  }
}

/**
 * Canary cron handler. Probes the deep health endpoint plus a couple of key
 * public endpoints from the public edge and alerts Discord on any failure.
 */
async function runCanary(env: Env): Promise<void> {
  const failures: string[] = [];
  for (const path of CANARY_TARGETS) {
    const url = `${CANARY_BASE_URL}${path}`;
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(CANARY_FETCH_TIMEOUT_MS),
      });
      if (!res.ok) {
        failures.push(`${path} → HTTP ${res.status}`);
      }
    } catch (err) {
      failures.push(`${path} → ${err instanceof Error ? err.message : "fetch error"}`);
    }
  }

  if (failures.length === 0) {
    console.log("[scheduled] canary ok", { targets: CANARY_TARGETS.length });
    return;
  }

  console.error("[scheduled] canary detected failures", { failures });
  await sendDiscordAlert(
    env,
    `🐀 Token Rats canary: ${failures.length} probe(s) failing\n${failures
      .map((f) => `• ${f}`)
      .join("\n")}`,
  );
}

/**
 * Weekly digest cron handler.
 *
 * Currently a no-op: the digest email path needs a working ESP and a fan-out
 * via Cloudflare Queues before it's worth re-enabling. Logged so crons that
 * fire while the function is still inert show up in tail.
 */
async function runWeeklyDigests(_env: Env): Promise<void> {
  console.warn("[scheduled] runWeeklyDigests: no-op — email delivery not wired up");
}

/** Refresh the D1 model catalog + price snapshots from OpenRouter. */
async function runDailyPriceRefresh(env: Env): Promise<void> {
  const t0 = Date.now();
  try {
    const result = await refreshPrices(env);
    const dt = Date.now() - t0;
    console.log("[scheduled] price refresh complete", {
      ms: dt,
      fetched: result.fetched,
      upserts: result.upserts,
      snapshots: result.snapshots,
      deactivated: result.deactivated,
      errors: result.errors,
    });
  } catch (err) {
    console.error("[scheduled] price refresh failed", err);
  }
}

/** Cron dispatcher. Called by the Worker's `scheduled` handler. */
export async function runScheduled(event: ScheduledEvent, env: Env): Promise<void> {
  switch (event.cron) {
    case WEEKLY_DIGEST_CRON:
      await runWeeklyDigests(env);
      return;
    case DAILY_PRICE_REFRESH_CRON:
      await runDailyPriceRefresh(env);
      return;
    case CANARY_CRON:
      await runCanary(env);
      return;
    default:
      console.warn("[scheduled] unhandled cron", { cron: event.cron });
  }
}
