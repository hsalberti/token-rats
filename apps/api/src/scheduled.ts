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
    default:
      console.warn("[scheduled] unhandled cron", { cron: event.cron });
  }
}
