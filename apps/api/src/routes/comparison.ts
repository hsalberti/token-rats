import { type SourceComparison, SubscriptionSpendRequest, UsageMonth } from "@token-rats/contracts";
import { Hono } from "hono";
import type { Env } from "../env.js";
import { validationError } from "../lib/errors.js";
import { loadPriceIndex, priceWithIndex } from "../lib/pricing.js";
import { type AuthVariables, requireAuth } from "../middleware/auth.js";

const comparison = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
comparison.use("*", requireAuth);
comparison.put("/subscriptions", async (c) => {
  const parsed = SubscriptionSpendRequest.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error.message);
  const { month, source, label, paidUsdCents } = parsed.data;
  await c.env.DB.prepare(`INSERT INTO subscription_spend (user_id, month, source, label, paid_usd_cents)
    VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, month, source) DO UPDATE SET
    label = excluded.label, paid_usd_cents = excluded.paid_usd_cents`)
    .bind(c.var.userId, month, source, label, paidUsdCents)
    .run();
  return c.json({ saved: true });
});
comparison.get("/", async (c) => {
  const parsed = UsageMonth.safeParse(c.req.query("month") ?? new Date().toISOString().slice(0, 7));
  if (!parsed.success) return validationError(c, "Use a month in YYYY-MM format");
  const month = parsed.data;
  const start = Date.parse(`${month}-01T00:00:00Z`);
  const endDate = new Date(start);
  endDate.setUTCMonth(endDate.getUTCMonth() + 1);
  const rows = await c.env.DB.prepare(`SELECT source, model,
    strftime('%Y-%m-%d', started_at / 1000, 'unixepoch') AS day,
    SUM(in_tokens) AS input, SUM(out_tokens) AS output, SUM(cache_read_tokens) AS cacheRead,
    SUM(cache_write_tokens) AS cacheWrite, SUM(reasoning_tokens) AS reasoning, COUNT(*) AS sessions
    FROM sessions WHERE user_id = ? AND started_at >= ? AND started_at < ?
    AND (channel IS NULL OR channel IN ('cli', 'ide', 'unknown'))
    GROUP BY source, model, day`)
    .bind(c.var.userId, start, endDate.getTime())
    .all<{
      source: string;
      model: string;
      day: string;
      input: number;
      output: number;
      cacheRead: number;
      cacheWrite: number;
      reasoning: number;
      sessions: number;
    }>();
  const spend = await c.env.DB.prepare(`SELECT source, label, paid_usd_cents AS paidUsdCents
    FROM subscription_spend WHERE user_id = ? AND month = ?`)
    .bind(c.var.userId, month)
    .all<{ source: string; label: string; paidUsdCents: number }>();
  const index = await loadPriceIndex(c.env);
  const sources: SourceComparison[] = [];
  for (const source of ["claude-code", "codex", "cursor"] as const) {
    const matching = rows.results.filter((r) => r.source === source);
    const plan = spend.results.find((r) => r.source === source);
    const item: SourceComparison = {
      source,
      sessions: 0,
      activeDays: new Set(matching.map((r) => r.day)).size,
      inTokens: 0,
      outTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: 0,
      estimatedApiUsd: 0,
      unpricedSessions: 0,
      tokensEstimated: source === "cursor",
      subscription: plan ? { label: plan.label, paidUsdCents: plan.paidUsdCents } : null,
    };
    for (const r of matching) {
      item.sessions += r.sessions;
      item.inTokens += r.input;
      item.outTokens += r.output;
      item.cacheReadTokens += r.cacheRead;
      item.cacheWriteTokens += r.cacheWrite;
      item.reasoningTokens += r.reasoning;
      const price = priceWithIndex(
        index,
        r.model,
        r.day,
        r.input,
        r.output,
        r.cacheRead,
        r.cacheWrite,
      );
      if (price.known) item.estimatedApiUsd += price.costUsd ?? price.costUsdCents / 100;
      else item.unpricedSessions += r.sessions;
    }
    sources.push(item);
  }
  return c.json({ month, sources });
});
export default comparison;
