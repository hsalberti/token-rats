# Inventory: Steinberger + adjacent orgs

**Research date:** 2026-05-18

Filtered from ~170 public repos on `github.com/steipete` plus `openclaw/*` and `amantus-ai/*` (his current and prior orgs) and key collaborator `badlogic`. Forks of upstream OSS (Sparkle, GRDB, SwiftLint, swift-argument-parser, etc.) and archived 2010-era ObjC widgets are intentionally excluded.

**Caveat:** Star counts and updated dates are as returned by GitHub's API; some numbers (e.g. `openclaw/openclaw` at 372,949 stars) look inflated and should be treated as a snapshot rather than authoritative.

## Most relevant — menu bar + token counter focus

| Name | URL | Stars | Lang | Tags | One-liner |
|---|---|---|---|---|---|
| CodexBar | https://github.com/steipete/CodexBar | 12,759 | Swift | menubar, token-counter, ai-dev-tool, mac-app | Menu bar app showing usage stats & cost for OpenAI Codex, Claude, Cursor, Gemini, Copilot, Grok and 40+ AI coding providers — no login required for most. |
| VibeMeter (DEPRECATED) | https://github.com/steipete/VibeMeter | 382 | Swift | menubar, token-counter, mac-app | Original menu bar cost tracker for Cursor and other AI providers — README explicitly says "deprecated, successor is CodexBar." Source still readable and is the cleanest reference implementation. |
| badlogic/cccost | https://github.com/badlogic/cccost | 68 | TypeScript | token-counter, cli | Process-wrap interceptor for `claude` CLI that captures every fetch() to Anthropic and writes per-session usage JSON. Not Steinberger's, but Steinberger ecosystem. |
| tokentally | https://github.com/steipete/tokentally | 68 | TypeScript | token-counter, library | "One tiny lib for LLM token + cost math." Browser-safe, normalizes token usage across providers, resolves pricing from LiteLLM + OpenRouter catalogs. |

## Menu bar apps (non-token-counter)

| Name | URL | Stars | Lang | Tags | One-liner |
|---|---|---|---|---|---|
| RepoBar | https://github.com/steipete/RepoBar | 2,037 | Swift | menubar, mac-app, cli | GitHub repo status (CI, issues, PRs, releases, local checkout state, rate-limits) in menu bar + companion `repobar` CLI. |
| BlackBar | https://github.com/steipete/BlackBar | 35 | Swift | menubar, mac-app | Blacksmith CI status in menu bar — minimal AppKit, no Dock icon, stores cookie in Keychain. |
| Trimmy | https://github.com/steipete/Trimmy | 692 | Swift | mac-app, terminal-tool, menubar | Flattens multi-line shell snippets on copy so they paste & run cleanly. Cleanest SwiftUI `MenuBarExtra` example. |
| openclaw/crawlbar | https://github.com/openclaw/crawlbar | 2 | Swift | menubar, mac-app, cli | Menu bar **control plane** for the family of `*crawl` local-first CLI apps. |
| ReleaseBar | https://github.com/steipete/ReleaseBar | 17 | TypeScript | menubar (web) | Web "release freshness" dashboard for OSS maintainers; *not* a Mac app despite the name — Cloudflare Worker + KV. |
| amantus-ai/vibetunnel | https://github.com/amantus-ai/vibetunnel | 4,502 | TypeScript | menubar, mac-app, terminal-tool, ai-dev-tool | Native macOS menu bar app + npm package proxying terminals into a browser, designed for monitoring AI agents remotely. |

## CLI tools & libraries

| Name | URL | Stars | Lang | Tags | One-liner |
|---|---|---|---|---|---|
| openclaw/Peekaboo | https://github.com/openclaw/Peekaboo | 4,359 | Swift | mac-app, cli, ai-dev-tool | macOS CLI + MCP server for screenshots, accessibility automation, agentic GUI control. |
| Commander | https://github.com/steipete/Commander | 39 | Swift | library, cli | Swift-first CLI parser, alternative to Apple's swift-argument-parser. Powers Peekaboo's CLI. |
| TauTUI | https://github.com/steipete/TauTUI | 136 | Swift | library, terminal-tool | Swift port of `pi-tui` — TUI library for Swift. |
| Matcha (archived) | https://github.com/steipete/Matcha | 61 | Swift | library, terminal-tool | Bubbletea-style TUI for Swift. Archived. |
| poltergeist | https://github.com/steipete/poltergeist | 400 | TypeScript | cli, terminal-tool, ai-dev-tool | Universal hot-reload / file watcher, Watchman-backed. Daemon + shared-state-file pattern relevant for Token Rats menu bar. |
| oracle | https://github.com/steipete/oracle | 2,297 | TypeScript | cli, ai-dev-tool | "Ask the oracle when you're stuck. Invoke GPT-5 Pro with a custom context and files." |
| summarize | https://github.com/steipete/summarize | 5,983 | TypeScript | cli, ai-dev-tool | Point at any URL/YouTube/Podcast/file, get the gist. |
| bslog | https://github.com/steipete/bslog | 62 | TypeScript | cli, terminal-tool | CLI for Better Stack logs. "Made for humans and agents." |
| Tachikoma (openclaw) | https://github.com/openclaw/Tachikoma | 262 | Swift | library, ai-dev-tool | Swift SDK that's "one interface, every AI model" — used by Peekaboo. |
| ElevenLabsKit | https://github.com/steipete/ElevenLabsKit | 103 | Swift | library, ai-dev-tool | Swift SDK to stream ElevenLabs voices. |
| SweetCookieKit | https://github.com/steipete/SweetCookieKit | 79 | Swift | library, mac-app | Extract browser cookies from macOS in Swift — "reuse existing browser session, store nothing." |
| AXorcist (openclaw) | https://github.com/openclaw/AXorcist | 276 | Swift | library, mac-app | Swift wrapper for macOS Accessibility APIs — chainable, fuzzy-matched queries. |

## Infrastructure & meta

| Name | URL | Stars | Lang | Tags | One-liner |
|---|---|---|---|---|---|
| homebrew-tap | https://github.com/steipete/homebrew-tap | 98 | Ruby | infra | Where his Mac casks (codexbar, blackbar, repobar, peekaboo, trimmy, etc.) ship from. Includes a cross-repo `update-formula.yml` workflow. |
| stats-store | https://github.com/steipete/stats-store | 50 | TypeScript | infra | "Fast, open, privacy-first analytics for Sparkle." Cloudflare Workers + Supabase. |
| agent-scripts | https://github.com/steipete/agent-scripts | 3,003 | Python | ai-dev-tool, docs | Current canonical place for shared `AGENTS.MD`, `skills/`, hooks, and `docs/RELEASING-MAC.md` master playbook. |
| openclaw/openclaw | https://github.com/openclaw/openclaw | 372,949 | TypeScript | ai-dev-tool | Headline of the OpenClaw org. (Star count looks suspicious — flagged.) |
| openclaw/acpx | https://github.com/openclaw/acpx | 2,689 | TypeScript | cli, ai-dev-tool | Headless CLI client for Agent Client Protocol sessions. |
| openclaw/mcporter | https://github.com/openclaw/mcporter | 4,448 | TypeScript | ai-dev-tool | Call MCPs as if they were TypeScript APIs. |

## Confirmations on specific repos

- **`VibeMeter`** — exists, deprecated, redirect-by-README to CodexBar.
- **`VibeTunnel`** — exists at `amantus-ai/vibetunnel`, not `steipete/*`.
- **`Peekaboo`** — exists at `openclaw/Peekaboo`, not `steipete/*`.
- **`claude-trace`** — does **not** exist under steipete, openclaw, amantus-ai, or badlogic. `@mariozechner/claude-trace` is the closest neighbor.
- **`ClaudeCodeMonitor`** — does **not** exist under steipete. Three unrelated competitor implementations exist by other authors.
- **`AgentRules`** — exists at `steipete/agent-rules`, archived → `steipete/agent-scripts`.
- **`claude-code-usage`** — does not exist under steipete. `badlogic/cccost` is the closest.
- **`Commander`** — exists at `steipete/Commander`, used inside Peekaboo.
- **`conduit-mcp`** — exists, archived.
- Watcher/monitor family: `poltergeist`, `tmuxwatch`, `BlackBar`, `crawlbar`, `RepoBar`.

## Sources

Inventory compiled from `https://github.com/steipete?tab=repositories` paginated, `https://github.com/orgs/openclaw/repositories`, and `https://github.com/orgs/amantus-ai/repositories`, plus targeted README fetches via `raw.githubusercontent.com`.
