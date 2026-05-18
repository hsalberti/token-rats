# Research: CodexBar

- **Site:** https://codex.bar / https://codexbar.app
- **Repo:** https://github.com/steipete/codexbar
- **Author:** Peter Steinberger (@steipete)
- **License:** MIT (`LICENSE` at repo root)
- **Platform:** macOS 14+ (Sonoma), Swift 6.2+, also ships a `codexbar` CLI for macOS + Linux
- **Pricing:** free + open source

## What it is

A native macOS menu-bar app that surfaces AI-coding-provider usage limits, credit balances, monthly spend, and reset windows for ~40 providers (Codex, Claude, Cursor, Gemini, Copilot, Grok, ElevenLabs, Deepgram, z.ai, MiniMax, Kiro, Bedrock, OpenRouter, Vertex AI, Augment, JetBrains AI, Warp, Ollama, Windsurf, DeepSeek, Mistral, Venice, …). The menu-bar icon doubles as a tiny usage meter; clicking it expands per-provider panels with daily/7d/30d totals, a 30-day sparkline, top model, and a 30-day cost scan for Codex + Claude. Companion `codexbar` CLI for scripts and CI checks.

Architecturally this is exactly the visual reference our **Phase 2 Track Q** (rich profile dashboard) cites and what the user's screenshot was from.

## How it accesses token data

CodexBar is unusual in that it reuses *existing* provider sessions instead of asking for new credentials. By provider:

| Provider | Mechanism |
|---|---|
| OpenAI / Codex | OAuth API + local Codex CLI logs (+ optional web dashboard via browser cookies) |
| Claude / Claude Code | OAuth API, browser cookies, or CLI PTY fallback. Local `~/.claude/` JSONL scan for 30-day cost |
| Cursor | Browser session cookies (Safari/Chrome via Full Disk Access, opt-in) |
| Gemini | OAuth via Gemini CLI credentials on disk |
| GitHub Copilot | GitHub device flow + internal API |
| AWS Bedrock | AWS credentials + Cost Explorer |
| Vertex AI | Google Cloud OAuth + local Claude logs |
| ElevenLabs / Deepgram / Mistral / DeepSeek / Venice / OpenRouter | Per-provider API keys |
| JetBrains AI | Local XML config files |
| Ollama / Warp | Browser cookies / localStorage |
| Misc others | API tokens, sqlite caches, local config files |

Config lives at `~/.codexbar/config.json`. Privacy stance: on-device parsing by default, browser cookies opt-in, no passwords stored.

## What we can copy under MIT

MIT is **maximally permissive**. We can:

- **Fork the repo** or vendor individual files into our codebase, provided we keep their copyright notice + the MIT license text.
- **Port the Swift code to TypeScript** for our parsers and proxy auth flows — the underlying mechanisms (where Codex/Claude logs live, JSONL shape, sqlite columns, OAuth scopes, cookie names) are facts, not copyrightable. The *implementation* is MIT-licensed; the *facts about how each provider stores usage* are public knowledge.
- **Reuse the provider matrix** (which providers, which auth mechanism each accepts) directly as input to our **Track P** "Other" picker. This is the most valuable artifact in the repo for us.
- **Mirror the visual pattern** of the per-provider tile (today / 7d / 30d / top model / sparkline) — UI ideas are not copyrightable, but we should *not* copy pixel-for-pixel SwiftUI views and re-skin them as ours; build our own React components inspired by the layout.

Attribution requirements are minimal: keep their `LICENSE` text + copyright notice in any file we lift. A `NOTICES.md` at our repo root is the cleanest place.

## What we should NOT copy

- **The name "CodexBar"** and any logos — not covered by MIT (trademarks are separate).
- **The product framing as a Mac menu bar app** — that's their differentiation; we are a social leaderboard. Copying their framing dilutes both products and burns the goodwill of a friendly upstream.
- **Their brand voice, screenshots, copy** — these are creative works; rewrite in our own voice.
- **The 30-day local-cost scan logic verbatim**, *if* we end up running it server-side after CLI upload — sanity-check that we're not just transcribing their algorithm line-for-line. Re-derive from the JSONL spec.

## Concrete take-aways for our roadmap

1. **Track A (parsers)** — CodexBar's source code is the single best reference for "where is the data on disk for provider X?" Use their Swift modules as a spec document, not a code source.
2. **Track M (API proxy)** — for OpenAI / Anthropic / OpenRouter, CodexBar shows that OAuth-on-CLI is viable; we can borrow scope sets and refresh-token semantics.
3. **Track P (Other picker)** — adopt their provider list (40+) as the master menu for the "Other" branch. Add an explicit "Open Source" option that links to compatible self-hosted runtimes (Ollama, vLLM, llama.cpp, OpenRouter-routed open models).
4. **Track Q (rich profile)** — their per-tile layout is the visual reference. Build our own components; do not lift the SwiftUI.

## Action items

- [ ] Add `NOTICES.md` if/when we vendor any code (none yet).
- [ ] Reach out to @steipete before launch as a courtesy — friendly upstream signaling, not a license requirement.
- [ ] Pin a specific commit of `steipete/codexbar` in our docs as the version we cross-referenced, so the provider-matrix snapshot is reproducible.
