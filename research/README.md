# Research: Peter Steinberger / @steipete public repos

**Research date:** 2026-05-18
**Researcher:** Claude Code (4 parallel research agents)
**Scope:** every public repo by Peter Steinberger (`github.com/steipete`) and his orgs (`openclaw`, `amantus-ai`) with a focus on macOS menu-bar apps, token-counting mechanisms, installation/distribution flow, and CLI ergonomics. Output is per-app deep dives plus cross-cutting analysis to inform Token Rats's roadmap.

Two files (`codexbar.md`, `blackbar.md`) pre-existed and are preserved unchanged — they are licensing-focused overviews. Everything else in this folder is from the 2026-05-18 research pass and goes deeper into source code, algorithms, and concrete copy/adapt actions.

## Files in this folder

### Cross-cutting analysis
- [`inventory.md`](./inventory.md) — full inventory of @steipete + adjacent orgs (170+ repos), filtered to ~45 relevant; star counts and dates with caveat.
- [`menubar-architecture.md`](./menubar-architecture.md) — patterns shared across CodexBar, VibeMeter, RepoBar, Trimmy, BlackBar for building macOS menu-bar apps.
- [`token-counting-deep-dive.md`](./token-counting-deep-dive.md) — the algorithms VibeMeter and CodexBar use for parsing Claude/Cursor logs, deduping, and pricing; comparison with Token Rats's current pipeline.
- [`distribution-playbook.md`](./distribution-playbook.md) — the "Steinberger system" for shipping macOS apps: brew tap, Sparkle 2 EdDSA appcast, signing/notarization, automated formula updates.
- [`proposals.md`](./proposals.md) — concrete implementation roadmap for Token Rats, prioritized.

### Per-app deep dives
- [`codexbar.md`](./codexbar.md) — flagship menu-bar AI usage tracker (12.7k stars, ~40 providers). **Pre-existing — light overview.**
- [`vibemeter.md`](./vibemeter.md) — deprecated predecessor to CodexBar (382 stars). Source is the cleanest fully-commented reference for the menu-bar architecture.
- [`repobar.md`](./repobar.md) — GitHub status menu bar (2k stars). Best architecture reference for "menu bar app + CLI sharing one storage layer."
- [`vibetunnel.md`](./vibetunnel.md) — browser-accessible terminal (4.5k stars, `amantus-ai/vibetunnel`). Best reference for distribution, 9-page Welcome flow, and CLI installer.
- [`trimmy.md`](./trimmy.md) — minimal SwiftUI `MenuBarExtra` example. Cleanest small reference.
- [`blackbar.md`](./blackbar.md) — Blacksmith CI menu bar. **Pre-existing — small reference.**
- [`peekaboo.md`](./peekaboo.md) — macOS screenshot/automation CLI + MCP server (4.4k stars, `openclaw/Peekaboo`). Reference for CLI distribution via brew + npm, with cross-repo automated tap updates.

### Libraries worth knowing
- [`libs.md`](./libs.md) — `tokentally` (TS pricing math), `cccost` (badlogic — process-wrap interceptor), `Commander` (Swift CLI parser), `SweetCookieKit`, `stats-store` (privacy-first Sparkle analytics).

## TL;DR — the four findings that matter most

1. **CodexBar is the canonical 2026 implementation of "AI usage in your menu bar"** — pluggable provider model, `models.dev` for live pricing, three orthogonal data-collection strategies (local JSONL, provider APIs, CLI PTY scrape). It is the direct architectural reference for any Token Rats menu-bar companion. See [`codexbar.md`](./codexbar.md) (overview) + [`token-counting-deep-dive.md`](./token-counting-deep-dive.md) (algorithms).

2. **Steinberger uses `messageId:requestId` as the per-entry dedupe key** when parsing Claude JSONL — this catches streaming chunks and `/resume` replays that Token Rats's current session-level dedupe (`sessions.dedupe_key`) misses. Bug history in the CodexBar CHANGELOG confirms double-counting was a real problem. See [`token-counting-deep-dive.md`](./token-counting-deep-dive.md).

3. **He has migrated both VibeMeter and CodexBar off a hardcoded `prices.json` to live `models.dev` lookups with a 24h cache.** Token Rats's `packages/pricing/prices.json` is the same anti-pattern; see [`proposals.md`](./proposals.md) for the migration plan.

4. **The "Steinberger system" for shipping Mac apps is reproducible end-to-end** — single homebrew tap, Sparkle 2 EdDSA appcast on GitHub raw, releases run from a developer laptop (not CI), and a cross-repo `update-formula.yml` workflow auto-bumps formulas. ~90% of the scripts copy-paste directly. See [`distribution-playbook.md`](./distribution-playbook.md).

## Caveats

- **Star counts and "updated" dates look inflated** in some places (e.g. CodexBar at 12,759 stars on 2026-05-18, `openclaw/openclaw` at 372,949 stars). The research agent reported numbers as returned by GitHub's API. Treat absolute numbers as a snapshot, not authoritative.
- **`claude-trace` does not exist under steipete.** The closest neighbor is `@mariozechner/claude-trace` (Mario Zechner, frequent collaborator). Steinberger's Claude-adjacent repos are `claude-code-mcp` (archived) and `agent-rules` (archived → `agent-scripts`).
- **`ClaudeCodeMonitor` does not exist under steipete.** Three unrelated implementations exist by other authors (`Aura-Technologies-llc`, `K9i-0`, `sealovesky`) — these are *competitor menu-bar Claude usage monitors*, not his work.
- A few repos have moved org: VibeTunnel is now `amantus-ai/vibetunnel`; Peekaboo is now `openclaw/Peekaboo`. Both repos are still primarily Steinberger-driven.
