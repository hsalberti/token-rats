# Proposals: applying Steinberger's patterns to Token Rats

**Research date:** 2026-05-18

Concrete, prioritized recommendations distilled from the per-app research. Each proposal cites the source code that demonstrates the pattern. Where Token Rats's `CLAUDE.md` / `mission.md` already encodes a constraint, this doc respects it.

## Priority 1 — quick wins, no new product surface (do this anyway)

### 1.1 Per-message dedupe via `(messageId, requestId)` in `packages/parsers`

**Why:** Token Rats's current dedupe is at the session level (`sessions.dedupe_key`). Two failure modes slip through:
- **Streaming chunks** — Claude Code writes multiple JSONL lines per assistant turn with cumulative `usage` counts; naïve summation over-counts
- **`/resume` and subagent replays** — child sessions copy parent turns into their JSONL; per-session dedupe doesn't catch the duplicates because they live in different sessions

CodexBar's CHANGELOG (`v0.20`, `v0.27`) confirms both as real bugs they shipped fixes for.

**How:** in `packages/parsers`, group lines by `(message.id, requestId)` and keep the row with the highest `output_tokens` (last write wins). Pass an optional `messageId` field on `SessionRecord` (or expose a new `MessageRecord` upload). On the Worker, dedupe per-message in addition to per-session.

**Reference:** https://github.com/steipete/CodexBar/blob/main/Sources/CodexBarCore/Vendored/CostUsage/CostUsageScanner%2BClaude.swift

**Effort:** ~1 day in parsers, ~1 day on the Worker, ~1 day of fixture tests against the existing `__fixtures__/`.

---

### 1.2 Migrate `packages/pricing` from hardcoded `prices.json` to `models.dev` (with offline fallback)

**Why:** Token Rats's `prices.json` requires a commit for every model release. Both VibeMeter and CodexBar started with hardcoded tables and migrated away — VibeMeter to a static fallback, CodexBar to live `models.dev` lookups with 24h cache. Steinberger learned this the slow way.

**How:**
1. Keep `prices.json` as **offline fallback only** — bundled with the package, never goes blind
2. **Worker:** cache `https://models.dev/api.json` in KV (`CACHE` binding) with 24h TTL; on fetch failure, last-good cache stays usable indefinitely
3. **CLI:** cache to `~/.cache/token-rats/models-dev.json` with 24h TTL and last-good fallback
4. Adopt CodexBar's normalization rules in `priceOf()`:
   - Strip `anthropic.` / `openai/` prefixes
   - Strip `-v\d+:\d+$` (Bedrock-style: `-v1:0`)
   - Strip `-\d{8}$` date suffixes (`claude-sonnet-4-5-20250929` → `claude-sonnet-4-5`)
   - Provider-scoped lookup (don't cross-contaminate `openai/gpt-4o` with `azure/gpt-4o` if rates differ)
5. Add tiered pricing for Claude's 200k context tier:
   ```ts
   function tiered(tokens: number, base: number, above?: number, threshold?: number): number
   ```

**References:**
- https://github.com/steipete/CodexBar/blob/main/Sources/CodexBarCore/Vendored/CostUsage/ModelsDevPricing.swift
- https://github.com/steipete/CodexBar/blob/main/Sources/CodexBarCore/Vendored/CostUsage/CostUsagePricing.swift
- https://models.dev/api.json

**Effort:** ~2 days. Pricing math is pure and well-tested.

---

### 1.3 Incremental file scanning in `packages/cli`

**Why:** The CLI currently re-parses files on every `sync`. With a year of `~/.claude/projects/` history, that's GB of JSONL re-scanned every run.

**How:** stored state at `~/.cache/token-rats/scan-state.json` (or in `~/Library/Application Support/token-rats/` on macOS) keyed by `(inode, device)` or path:

```json
{
  "files": {
    "<path>": { "parsedBytes": 12345, "mtime": "2026-05-18T...", "size": 12345 }
  }
}
```

On next run: `fs.seek(parsedBytes)`, read forward, append new offset.

**Reference:** https://github.com/steipete/CodexBar/blob/main/Sources/CodexBarCore/Vendored/CostUsage/CostUsageJsonl.swift

**Effort:** ~1 day. Big wall-clock and IO win for repeat syncs.

---

### 1.4 Byte-level prefilter before JSON.parse in `packages/parsers`

**Why:** ~50% of JSONL lines are non-assistant messages without `usage` blocks. Decoding them is wasted CPU. Especially relevant if parsing in a Worker (CPU-budgeted).

**How:**
```ts
for (const line of lines) {
  if (!line.includes('"type":"assistant"')) continue;
  if (!line.includes('"usage"')) continue;
  const parsed = JSON.parse(line);
  // ...
}
```

**Reference:** same file as 1.3.

**Effort:** ~30 minutes. Easy benchmark win.

---

### 1.5 Add `cache_creation_input_tokens` + `cache_read_input_tokens` as first-class columns

**Why:** Cache tokens at near-zero cost can be 30–80% of total tokens in long sessions. If `daily_rollup` doesn't track them separately, the cost math is approximate.

**How:** audit `packages/contracts` `SessionRecord` schema, audit `daily_rollup` D1 schema, ensure both fields are stored and surfaced. Migration file in `infra/migrations/` if needed (don't edit `0001_init.sql`).

**Reference:** https://github.com/steipete/CodexBar/blob/main/Sources/CodexBarCore/Vendored/CostUsage/CostUsageModels.swift

**Effort:** ~0.5 day (likely already done; if not, ~1 day with migration).

---

## Priority 2 — distribution upgrades, no new app

### 2.1 Brew-install the existing CLI

**Why:** Token Rats CLI is npm-only today. Brew is a more familiar install vector for many dev-tool audiences. Steinberger ships several CLIs as both npm + brew (poltergeist, Peekaboo, CodexBar's CLI).

**How:**
1. Create `hsalberti/homebrew-tap` (or `token-rats/homebrew-tap`)
2. Copy `oracle.rb` formula pattern verbatim (Node CLI, `language/node`, `std_npm_args`)
3. Copy `.github/workflows/update-formula.yml` and `.github/scripts/update_formula.py` from `steipete/homebrew-tap` into your tap
4. In Token Rats CLI's release workflow, on `release: published`:
   - Build a tarball from `packages/cli`
   - Upload to the GitHub release
   - `gh workflow run update-formula.yml --repo <you>/homebrew-tap -f formula=token-rats -f tag=$TAG ...` and watch
5. Add formula `caveats` block with first-run hints ("run `token-rats login` to authenticate")

**References:**
- https://github.com/steipete/homebrew-tap/blob/main/Formula/oracle.rb
- https://github.com/steipete/homebrew-tap/blob/main/.github/workflows/update-formula.yml
- https://github.com/openclaw/Peekaboo/blob/main/.github/workflows/update-homebrew.yml

**Effort:** ~half-day for the formula + workflow, given the templates exist. End state: `brew install hsalberti/tap/token-rats`.

---

### 2.2 Add a `token-rats doctor` subcommand

**Why:** Pattern from Peekaboo's `peekaboo permissions status/grant`. Diagnoses log path access, OAuth session validity, network reachability without trial-and-error support.

**How:** new subcommand in `packages/cli/src/commands/doctor.ts` that runs:
- Find `~/.claude/projects/`, `~/.cursor/`, etc. → exists? readable? non-empty?
- Test `/v1/me` against the configured API host → 200? cookie valid?
- Print pricing-source freshness (`models.dev` cache age)
- Print parser stats (last sync timestamp, file count, total entries, dedupe rate)

**Effort:** ~half-day.

---

### 2.3 Optional: opt-in Cursor API ingestion

**Why:** Cursor doesn't write local logs of the same fidelity as Claude Code. A local-only approach is *fundamentally lossy* for Cursor users.

**How:**
1. New CLI subcommand `token-rats sync --cursor-api`
2. Launch a local extraction flow: open `https://cursor.com/`, instruct user to paste the `WorkosCursorSessionToken` cookie value (or read it via `sweet-cookie` npm)
3. GET `https://cursor.com/api/usage-summary` for billing-cycle aggregate counts
4. Transform into `SessionRecord` shape with `source: "cursor-api"`
5. Dedupe against local Cursor log parser output by `(date, model)`

**Privacy:** `/api/usage-summary` returns counts, not content — honours the `mission.md` rule. Document explicitly in the CLI README.

**References:**
- https://github.com/steipete/VibeMeter/blob/main/VibeMeter/Core/Providers/Cursor/CursorAPIConstants.swift
- https://github.com/steipete/sweet-cookie (TypeScript cookie extractor)

**Effort:** ~2-3 days. Defer until there's user demand.

---

### 2.4 Optional: Anthropic Admin API ingestion for org users

**Why:** For teams on the Anthropic Console with an Admin API key, the ground-truth data is at `/v1/organizations/usage_report/messages`. Position as enterprise reconciliation: "the API said X, your CLI uploads said Y, here's the delta."

**How:** an `orgs` opt-in setting that stores an Anthropic admin key (encrypted server-side) and lets the Worker run a daily cron pulling org-wide usage as authoritative numbers. The `org_id` column already exists on `rooms`, so the data model is ready.

**Reference:** https://github.com/steipete/CodexBar/blob/main/Sources/CodexBarCore/Providers/Claude/ClaudeAdminAPIUsageFetcher.swift

**Effort:** ~3-5 days. Defer until the org plan has paying users.

---

## Priority 3 — the menu-bar widget (deferred)

A Mac menu-bar widget is currently noted in the `roadmap.md` "deferred" section. If/when it becomes a roadmap item, here's the prescriptive plan.

### 3.1 Architecture decisions to lock in upfront

- **Non-sandboxed**, Developer ID only. Match CodexBar/RepoBar. The parsers need disk access to `~/.claude/`, `~/.cursor/`, etc. Sandboxing forces user-selected per-file reads and triggers Apple's Sparkle XPC gotcha (`-spks`/`-spki` exceptions).
- **SwiftUI `MenuBarExtra` + Settings Scene** for v0.1 (Trimmy pattern). Only graduate to AppKit `NSStatusItem` (VibeMeter pattern) if you need an animated gauge icon or multi-status-item layout.
- **No welcome wizard.** Match CodexBar's minimalism: open menu bar → "click here to sign in" → OAuth in default browser → done. Do NOT copy VibeTunnel's 9-page carousel.
- **No telemetry.** Match Trimmy (none) — privacy is a load-bearing claim in `mission.md`. If install counts matter later, add `stats.store` (one-line Info.plist change).

### 3.2 Dependency floor

- `sparkle-project/Sparkle` ≥ 2.8
- `kishikawakatsumi/KeychainAccess` (or Security.framework direct)
- `sindresorhus/KeyboardShortcuts`
- `orchetect/MenuBarExtraAccess` (programmatic open/close)
- Maybe `swift-log`

### 3.3 The data layer — don't duplicate parsers in Swift

Token Rats's parsers are pure TypeScript with fixture tests. **Do NOT reimplement in Swift.** Instead:

**Option A (recommended):** The Swift widget calls the existing `token-rats` CLI as a subprocess and parses its JSON output. The CLI writes a state snapshot to `~/Library/Application Support/token-rats/state.json` (or a shared `~/.token-rats/state.json`); the widget tails or polls it. Daemon pattern adapted from Steinberger's `poltergeist`.

**Option B:** The widget makes HTTP calls to the Worker API for everything (leaderboards, recent sessions). Local-only state is just OAuth session + cached responses. Simpler, but offline-first is worse.

### 3.4 Components to copy

- **`InstallOrigin.swift`** (4 lines) — detect Homebrew install and disable Sparkle
- **`DisabledUpdaterController`** (10 lines) — no-op updater for debug builds
- **`CustomMenuWindow.swift`** (~150 lines) — borderless NSPanel with Bartender fallback (if graduating to AppKit)
- **`GaugeIcon.swift`** (~80 lines SwiftUI Canvas) — for the eventual token-budget gauge
- **`StatusBarAnimationController.swift`** — adaptive 30fps/3fps frame rate (only if graduating to AppKit)
- **`LaunchAtLoginManager.swift`** with `SMAppService.mainApp.register()`
- **Single-instance enforcement** via `NSRunningApplication.runningApplications(withBundleIdentifier:)` + `DistributedNotificationCenter`
- **`ApplicationMover`** prompt to move from Downloads to /Applications

### 3.5 Distribution

1. Primary: `brew install --cask hsalberti/tap/tokenrats`
2. Secondary: Direct ZIP on GitHub Releases (drag-to-Applications)
3. Cask's `binary` stanza symlinks `TokenRats.app/Contents/Helpers/TokenRatsCLI` → `token-rats` in `$(brew --prefix)/bin` (if a Swift CLI ships in the app)
4. Sparkle 2 EdDSA appcast on GitHub raw
5. `Scripts/release.sh` copied verbatim from CodexBar — preflight → build → sign → notarize → DMG/ZIP → appcast → GitHub Release → dispatch tap → verify

### 3.6 Permissions / entitlements (minimum viable)

```xml
<key>com.apple.security.app-sandbox</key>            <false/>
<key>com.apple.security.hardened-runtime</key>       <true/>
<key>keychain-access-groups</key>
<array><string>$(AppIdentifierPrefix)com.tokenrats.menubar.shared</string></array>
<key>LSUIElement</key>                               <true/>
<key>SUFeedURL</key><string>https://raw.githubusercontent.com/.../appcast.xml</string>
<key>SUPublicEDKey</key><string>...</string>
```

**Do NOT request:** Accessibility, Screen Recording, Apple Events (unless feature surface explicitly needs them).

### 3.7 Cleanup — `zap trash:` in the cask

Enumerate every path the app touches:
- `~/Library/Application Support/TokenRats`
- `~/Library/Application Support/com.tokenrats.menubar`
- `~/Library/Caches/TokenRats`
- `~/Library/Containers/com.tokenrats.menubar`
- `~/Library/HTTPStorages/com.tokenrats.menubar*`
- `~/Library/Preferences/com.tokenrats.menubar.plist`
- `~/Library/Saved Application State/com.tokenrats.menubar.savedState`
- `~/Library/WebKit/com.tokenrats.menubar`
- Keychain access group + Application Scripts

So `brew uninstall --cask --zap tokenrats` is a true factory reset.

---

## Suggested sequencing

| Phase | Scope | Effort | Confidence |
|---|---|---|---|
| **Phase 1** (this sprint?) | 1.1 dedupe + 1.4 prefilter + 1.5 cache-token columns | ~3-5 days | High — pure parser changes, well-covered by fixtures |
| **Phase 2** | 1.2 models.dev migration + 1.3 incremental scan | ~3-4 days | High |
| **Phase 3** | 2.1 brew the CLI + 2.2 doctor subcommand | ~1 day | High |
| **Phase 4** | 2.3 Cursor API ingestion (if there's demand) | ~2-3 days | Medium |
| **Phase 5** | 2.4 Anthropic Admin API for orgs | ~3-5 days | Medium |
| **Phase 6+** | 3.* Mac menu-bar widget | ~3-5 weeks first ship | Low — bigger architectural commitment |

## What to NOT do, even though it's in CodexBar

- **40+ providers.** Token Rats's scope is Claude Code + Cursor + a few opt-in API providers. Don't drown in provider sprawl.
- **PTY-scraping the `claude` CLI for `/status`.** Brittle, breaks every Claude Code version. The JSONL is authoritative.
- **Custom BPE tokenizer to "estimate" tokens.** VibeMeter had one; Steinberger deleted it. The `usage` field is canonical.
- **claude.ai cookie scraping.** Reserve as a desperate fallback; never default.
- **9-page Welcome wizard.** Trim ruthlessly.
- **A whole stats-store proxy.** Optional; only useful for install-count vanity metrics on a Mac app.
- **Mac App Store.** Sandboxing it forces too many compromises in disk access and Sparkle XPC.

## Open questions to resolve before any of this

- Does the Anthropic Admin API rate-limit per-org? — confirm before Phase 5.
- What's the `models.dev` API stability story? — community-maintained, but Token Rats's Worker can mirror it to `CACHE` KV as insurance.
- Is the `messageId:requestId` dedupe scheme stable across Claude Code versions? — fixture tests against `0.x` and `1.x` Claude Code outputs would lock this down.

## Friendly upstream signal

Pre-existing `research/codexbar.md` already notes "Reach out to @steipete before launch as a courtesy." Still applies — especially if Token Rats borrows the dedupe + pricing patterns wholesale. He's friendly to OSS adopters.
