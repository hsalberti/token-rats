// Prices in USD per million tokens (input / output). pricesFetchedAt is the
// date these were last cross-referenced against the official provider pricing
// pages. Re-fetch with the find-docs skill if any of these look stale.
export const pricesFetchedAt = "2026-05-18";

export const prices = {
  models: {
    // ── Anthropic / Claude ────────────────────────────────────────────────
    "claude-opus-4-7": { inputPerMTok: 15, outputPerMTok: 75 },
    "claude-opus-4-6": { inputPerMTok: 15, outputPerMTok: 75 },
    "claude-sonnet-4-6": { inputPerMTok: 3, outputPerMTok: 15 },
    "claude-sonnet-4-5": { inputPerMTok: 3, outputPerMTok: 15 },
    "claude-haiku-4-5": { inputPerMTok: 0.8, outputPerMTok: 4 },
    "claude-3-5-sonnet-20241022": { inputPerMTok: 3, outputPerMTok: 15 },
    "claude-3-5-sonnet-20240620": { inputPerMTok: 3, outputPerMTok: 15 },
    "claude-3-5-haiku-20241022": { inputPerMTok: 0.8, outputPerMTok: 4 },
    "claude-3-opus-20240229": { inputPerMTok: 15, outputPerMTok: 75 },
    "claude-3-sonnet-20240229": { inputPerMTok: 3, outputPerMTok: 15 },
    "claude-3-haiku-20240307": { inputPerMTok: 0.25, outputPerMTok: 1.25 },

    // ── OpenAI / Codex ────────────────────────────────────────────────────
    // GPT-5 family. gpt-5-codex is the Codex CLI's public model; OpenAI's
    // pricing page lists only input ($1.25/MTok). Output uses the same $10
    // rate the broader GPT-5 base is publicly quoted at — flagged here for
    // re-verification when OpenAI publishes an explicit output figure.
    "gpt-5-codex": { inputPerMTok: 1.25, outputPerMTok: 10 },
    "gpt-5-mini": { inputPerMTok: 0.25, outputPerMTok: 2 },
    "gpt-5-nano": { inputPerMTok: 0.05, outputPerMTok: 0.4 },
    "gpt-5-pro": { inputPerMTok: 15, outputPerMTok: 120 },
    "gpt-5.5": { inputPerMTok: 5, outputPerMTok: 30 },
    "codex-mini-latest": { inputPerMTok: 1.5, outputPerMTok: 6 },

    // GPT-4 family.
    "gpt-4o": { inputPerMTok: 2.5, outputPerMTok: 10 },
    "gpt-4o-mini": { inputPerMTok: 0.15, outputPerMTok: 0.6 },
    "gpt-4-turbo": { inputPerMTok: 10, outputPerMTok: 30 },
    "gpt-4.1": { inputPerMTok: 2, outputPerMTok: 8 },
    "gpt-4.1-mini": { inputPerMTok: 0.4, outputPerMTok: 1.6 },
    "gpt-4.1-nano": { inputPerMTok: 0.1, outputPerMTok: 0.4 },

    // Reasoning models (o-series).
    o1: { inputPerMTok: 15, outputPerMTok: 60 },
    "o1-mini": { inputPerMTok: 3, outputPerMTok: 12 },
    // o3 was repriced in 2026; previously $10/$40, now $2/$8.
    o3: { inputPerMTok: 2, outputPerMTok: 8 },
    "o3-mini": { inputPerMTok: 1.1, outputPerMTok: 4.4 },
    "o4-mini": { inputPerMTok: 1.1, outputPerMTok: 4.4 },
  },
} as const;
