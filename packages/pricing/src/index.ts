import { prices } from "./prices.js";

export type ModelPrice = { inputPerMTok: number; outputPerMTok: number };

const TABLE: Record<string, ModelPrice> = prices.models;

export function priceOf(
  model: string,
  inTokens: number,
  outTokens: number,
): { costUsdCents: number; known: boolean } {
  const p = TABLE[model] ?? matchPrefix(model);
  if (!p) return { costUsdCents: 0, known: false };
  const dollars = (inTokens * p.inputPerMTok + outTokens * p.outputPerMTok) / 1_000_000;
  return { costUsdCents: Math.round(dollars * 100), known: true };
}

function matchPrefix(model: string): ModelPrice | undefined {
  // Allow date-suffixed variants like "claude-opus-4-7-20260101" to match
  // their family entry "claude-opus-4-7" without a separate table row.
  let best: { key: string; price: ModelPrice } | undefined;
  for (const [key, price] of Object.entries(TABLE)) {
    if (model.startsWith(key) && (!best || key.length > best.key.length)) {
      best = { key, price };
    }
  }
  return best?.price;
}
