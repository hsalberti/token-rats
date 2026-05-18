# Research: relevant libraries in the steipete orbit

**Research date:** 2026-05-18

Small but high-leverage libraries — either Steinberger's or adjacent — that map directly onto Token Rats packages.

## tokentally (steipete) — direct overlap with `@token-rats/pricing`

- **Repo:** https://github.com/steipete/tokentally
- **Stars:** 68
- **Language:** TypeScript
- **License:** MIT

Tiny TS library that normalizes token usage across providers and resolves per-token pricing. Three pricing sources: a static map, the **LiteLLM catalog**, and **OpenRouter's pricing endpoint**. Browser-safe core, with Node helpers in `tokentally/node` for catalog loaders.

API surface:
```ts
normalizeTokenUsage(raw) → { inputTokens, outputTokens, reasoningTokens, totalTokens }
pricingFromUsdPerMillion(input, output, cached?)
estimateUsdCost({ usage, pricing })
tallyCosts(calls)
```

Install: `pnpm add tokentally`. Explicitly disclaims "perfect accounting" — same posture you'd want.

**Token Rats application:** the LiteLLM catalog source is an upgrade path for `prices.json`. The `normalizeTokenUsage` shape (with `reasoningTokens` as a first-class field) is something `packages/contracts` likely lacks and will need as reasoning models become mainstream. See [`proposals.md`](./proposals.md).

---

## cccost (badlogic) — process-wrap interceptor

- **Repo:** https://github.com/badlogic/cccost
- **Stars:** 68
- **Author:** Mario Zechner — frequent Steinberger collaborator
- **License:** MIT

Wraps the `claude` CLI and injects an interceptor that hooks Node's `fetch()` inside the Claude Code process, capturing every API request to Anthropic in real time. Writes `~/.claude/projects/<mangled-cwd>/<sessionid>.usage.json` with per-model totals:

```json
{
  "requests": 42,
  "totalCost": 1.27,
  "models": {
    "claude-sonnet-4-20250514": {
      "input_tokens": 12345,
      "output_tokens": 6789,
      "cache_creation_input_tokens": 200,
      "cache_read_input_tokens": 4500,
      "cost": 1.27
    }
  },
  "last": { /* most recent request snapshot */ }
}
```

Ships an example `statusline.js` for Claude Code's statusline. Install: `npm install -g @mariozechner/cccost`. Run via `cccost --dangerously-skip-permissions` instead of `claude`.

**Token Rats application:** a process-wrap interceptor is more accurate than log-parsing alone, particularly for cache tokens. Worth considering as an opt-in CLI mode beyond the current parser pipeline. At minimum, confirm Token Rats's parsers handle the same cache fields cccost emits. See [`token-counting-deep-dive.md`](./token-counting-deep-dive.md).

---

## Commander (steipete) — Swift CLI parser

- **Repo:** https://github.com/steipete/Commander
- **Stars:** 39
- **License:** MIT

A Swift-native CLI framework described as a "Swifty take on Commander.js and an alternative to Swift's ArgumentParser." Declarative property wrappers — `@Option`, `@Argument`, `@Flag` — with centralized parsing and metadata validation.

The interesting bit: it automatically **exports command signatures and structural metadata**, making it efficient for AI agents and MCP servers to interact with and understand the CLI.

**Token Rats application:** only relevant if Token Rats ever ships a Swift CLI (e.g. menu-bar widget bundles one). For the current TypeScript CLI, the analog is something like Commander.js or sade — but the Commander **idea** ("auto-derive MCP / agent-friendly metadata from the CLI command tree") is something to keep in mind if Token Rats ever exposes an MCP server.

---

## SweetCookieKit (steipete) — browser cookie extraction

- **Repo:** https://github.com/steipete/SweetCookieKit
- **Stars:** 79
- **License:** MIT

Swift library to extract cookies from macOS browsers (Safari, Chromium-family). The "reuse existing browser session, store nothing" pattern that CodexBar relies on for ~10 of its 40 providers — including Cursor.

There are sibling repos for other languages:
- `steipete/sweet-cookie` (TypeScript, any OS)
- `steipete/sweetcookie` (Go)

**Token Rats application:** if Token Rats ever needs to ingest Cursor usage via the dashboard API (`/api/usage-summary`), the cleanest UX is to extract the existing Cursor session cookie from the user's browser instead of asking them to paste it. The TypeScript variant (`sweet-cookie`) drops directly into the CLI. See [`proposals.md`](./proposals.md).

---

## stats-store (steipete) — privacy-first Sparkle analytics

- **Repo:** https://github.com/steipete/stats-store
- **Stars:** 50
- **Language:** TypeScript (Cloudflare Workers + Supabase — same architecture as Token Rats!)
- **License:** MIT

Self-hostable Sparkle analytics proxy. Apps set their `SUFeedURL` to `https://stats.steipete.com/api/v1/appcast/<app>.xml`; the worker fetches the real appcast from a backing store, counts the request anonymously (macOS version, CPU type, app version, daily unique), and returns it.

Privacy claims:
- No IP storage
- No fingerprinting
- macOS version + CPU + app version only
- Daily uniques only

**Token Rats application:** if/when Token Rats ships a Mac widget with Sparkle, this is a free drop-in for install/version analytics. The architecture is the same Worker + KV pattern Token Rats already uses, so self-hosting is trivial — clone the repo, deploy to your Cloudflare account. Steinberger himself has migrated CodexBar off it (now points directly at GitHub raw appcast), so treat as a nice-to-have, not a default.

Reference: https://steipete.me/posts/2025/stats-store-privacy-first-sparkle-analytics

---

## Tachikoma (openclaw) — Swift "every AI model" SDK

- **Repo:** https://github.com/openclaw/Tachikoma
- **Stars:** 262
- **License:** MIT

"One interface, every AI model" — a Swift abstraction over Anthropic, OpenAI, Google, OpenRouter, etc. Used by Peekaboo for multi-provider AI.

**Token Rats application:** not relevant unless Token Rats ever needs to call LLMs server-side (e.g., for the `/cards` OG generator or trending content summarization). If it does, the multi-provider abstraction is mature.

---

## models.dev (NOT a steipete repo, but the upstream Token Rats should adopt)

- **API:** https://models.dev/api.json
- **License:** community-maintained, free, no auth

The community-maintained "every AI provider's pricing in one JSON." CodexBar migrated its pricing from a hardcoded table to live `models.dev` lookups with a 24h local cache and last-good fallback. Covers ~all major providers including Anthropic, OpenAI, Google, Mistral, Cohere, AWS Bedrock, Vertex AI, OpenRouter, etc.

**Token Rats application:** the single best lift in this entire research. See [`proposals.md`](./proposals.md) for the migration plan replacing `packages/pricing/prices.json`.
