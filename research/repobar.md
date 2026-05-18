# Research: RepoBar

**Research date:** 2026-05-18

- **Repo:** https://github.com/steipete/RepoBar
- **Stars:** 2,037
- **License:** MIT
- **Platform:** macOS, Swift / SwiftPM-based, with a `pnpm` script wrapper

## What it is

A native macOS menu-bar app that surfaces GitHub repository health: CI status, open issues, PRs, releases, recent activity, local checkout state (branch, ahead/behind, worktrees, dirty files), and GitHub API rate-limit health. Companion `repobar` CLI mirrors the same data.

**It is the best architectural reference in Steinberger's catalog for a "menu bar app + CLI sharing one storage layer with cache-first opening, hybrid auth storage, and offline-archive fallback."** Token Rats's eventual menu-bar widget should crib heavily from RepoBar.

## Tech stack

- Swift, SwiftPM-based macOS app
- `pnpm` scripts wrap the build (interesting hybrid — SwiftPM for code, pnpm for orchestration)
- Sparkle 2 for auto-update
- SQLite (RepoBar-owned, schema TBD by inspection) for cache
- Keychain (release builds) / file-backed (debug builds) for auth storage

## Key patterns worth copying

### 1. Cache-first opening

RepoBar stores REST ETags, response bodies, GraphQL responses, recent lists, repo detail rows, and rate-limit state in a RepoBar-owned SQLite. First-open menu rows are seeded from persistent cache, then refreshed in the background. This is the right model for any menu-bar app — the menu must feel instant; waiting for a network roundtrip to render anything makes it feel sluggish.

**Token Rats application:** when the menu bar widget opens, show cached leaderboard rows + last-N-days session rollup from a local SQLite, then refresh from the Worker in background.

### 2. Hybrid auth storage (release vs. debug)

Release builds use Keychain. **Debug builds and SwiftPM CLI/test runs default to file-backed storage** so developers don't get Keychain UI prompts every time they `swift test` or `swift run`. The release checklist explicitly verifies the `RepoBarTokenStore=file` Info.plist key is absent from shipped binaries.

**Token Rats application:** the menu bar widget will need to store a session token after OAuth. Follow the same split — Keychain in release, file in debug.

### 3. CLI mirrors app paths

`repobar` CLI shares the same GitHub + cache paths as the app. Examples documented in the README:
- `repobar repos --plain`
- `repobar issues owner/repo`
- `repobar rate-limits --plain`
- `repobar cache status`

This lets power users script everything the menu shows. The CLI binary ships *inside* the `.app` bundle (`RepoBar.app/Contents/MacOS/repobarcli`), and the Homebrew cask's `binary` stanza symlinks it as `repobar` into `$(brew --prefix)/bin`. One install → both binaries.

**Token Rats application:** if/when there's a Mac widget, ship the existing TypeScript CLI bundled in the app and symlinked via brew, *or* call the existing `token-rats` npm CLI as a subprocess. The latter is simpler since the parsers live in TypeScript anyway.

### 4. Archive import for offline / rate-limited use

RepoBar can import an "archive" — backups in the `gitcrawl.sh` portable-store format (Git-backed SQLite snapshots) — so the menu never goes blank when GitHub is rate-limited. This is over-engineering for Token Rats's current scope, but the pattern of "always have something to show, even if it's stale" is right.

### 5. Minimum-permission auth via GitHub App

RepoBar uses GitHub **App user tokens** (preferred) with classic PAT fallback. The README explains the trade-off explicitly. Apps grant per-installation, narrow scopes; classic OAuth scopes are blunter. Token Rats already does cookie auth backed by GitHub OAuth — keep scopes minimal as feature surface grows.

### 6. Submenu shows local git state

The repository submenu shows local git state (branch, ahead/behind, worktrees, dirty files) by scanning `~/Projects`. The app **bridges remote API data and local filesystem state** — exactly the same shape as Token Rats bridging the Worker API and `~/.claude/`/`~/.cursor/` logs.

## Release / distribution

Same `scripts/release.sh` one-command path as CodexBar: builds, signs, notarizes, generates appcast HTML notes, publishes GH release, tags/pushes. Sparkle 2 EdDSA appcast. See [`distribution-playbook.md`](./distribution-playbook.md) for the full pattern.

## Entitlements

- `com.apple.security.hardened-runtime`
- `com.apple.security.automation.apple-events` (for some menu interactions)
- `keychain-access-groups` (release builds)
- Sparkle `-spks/-spkd` Mach-lookup exceptions (per the master playbook)

## What to take for Token Rats

| Pattern | Token Rats analog |
|---|---|
| Cache-first menu rendering (SQLite seed → background refresh) | Menu bar widget seeds from local SQLite (leaderboards, recent sessions) then hits Worker |
| Keychain (release) / file (debug) auth split | Same — store session token; avoid dev-time Keychain spam |
| App-bundled CLI symlinked via cask | Bundle `token-rats` CLI inside the `.app`, symlink via brew |
| Bridges remote API + local filesystem | Already the Token Rats shape (Worker + local logs); reinforce by keeping CLI as the single ingest path |
| GitHub App tokens (minimum scope) | Already cookie-based; just keep scopes minimal as Account API grows |
| Offline-archive fallback | Defer — over-engineering today |

## Key file references

- Repo README: https://github.com/steipete/RepoBar#readme
- Sparkle / release scripts: pattern identical to CodexBar's `Scripts/release.sh`
