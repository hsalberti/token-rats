# Research: VibeMeter

**Research date:** 2026-05-18

- **Repo:** https://github.com/steipete/VibeMeter
- **Status:** Deprecated (README redirects to CodexBar). Source remains intact and is the cleanest fully-commented reference implementation of Steinberger's menu-bar pattern.
- **License:** MIT
- **Platform:** macOS 15+, Swift 6, SwiftUI + AppKit hybrid

## What it is

The 2025-era precursor to CodexBar — a macOS menu-bar app that tracked spend across Cursor and Claude. It only supported two providers, but the source code is much more readable than CodexBar's ~200-file SwiftPM tree, and large parts of its `CostUsage/` module were vendored into CodexBar. **For learning the architecture, read VibeMeter first; for the current product, look at CodexBar.**

## Tech stack

- Swift 6, SwiftUI + AppKit hybrid (Xcode workspace + project, not SwiftPM)
- xcconfig layering: `Shared.xcconfig`, `Debug.xcconfig`, `Release.xcconfig`, `version.xcconfig`, optional `Local.xcconfig`
- **Dependencies** (`.package.resolved`):
  - `Sparkle` 2.7.0 — auto-update
  - `KeychainAccess` 4.2.2 — Keychain wrapper
  - `GRDB.swift` 7.5.0 — SQLite for cached invoices and log scan results
  - `swift-log` 1.6.3

## Menu bar architecture — the part worth studying

A `StatusBarController` owns an `NSStatusItem`, delegating to **six specialized managers**:

| Manager | Role |
|---|---|
| `StatusBarDisplayManager` | Renders icon + title. LRU `IconCacheKey` cache (max 50 entries) keyed by state/value/darkMode/connectionStatus. Uses `ImageRenderer` to rasterize a SwiftUI view at scale 2.0, sets `isTemplate = true`. |
| `StatusBarMenuManager` | Wires left-click → `CustomMenuWindow`, right-click → `NSMenu`. Right-click hack: assigns menu to `statusItem.menu`, calls `performClick()`, then clears the menu. |
| `StatusBarAnimationController` | Adaptive timer: 33ms (30fps) when animating, 67ms (15fps) when value changing, 300ms (3.3fps) when idle. Skips updates entirely after 10s of no change. |
| `StatusBarObserver` | Subscribes to `@Observable` models, calls `setNeedsDisplay`. |
| `StatusBarTooltipProvider` | Builds tooltip text. |
| `StatusBarAccessibilityProvider` | VoiceOver labels. |

### `CustomMenuWindow` — the polished popover replacement

In `VibeMeter/Presentation/Components/CustomMenuWindow.swift`:

- Borderless `NSPanel`, `styleMask: [.borderless, .nonactivatingPanel, .utilityWindow]`
- `level = .popUpMenu`
- `collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .transient]`
- `hidesOnDeactivate = false` (critical for menu bar)
- `isReleasedWhenClosed = false`
- 12pt corner radius via `wantsLayer + cornerRadius + masksToBounds`
- Auto-sizes to SwiftUI's `fittingSize` after `layoutSubtreeIfNeeded()`
- **Fallback positioning** when `buttonFrameInScreen.width == 0` — pops at top-right of screen. Handles "user has Bartender/Ice hiding the icon" non-obviously.
- `NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown])` to dismiss on outside click; tears down monitor on hide.
- Multi-strategy display (`orderFrontRegardless` → `makeKeyAndOrderFront` → fallback) to dodge a SwiftUI-in-AppKit first-show hang.
- Background uses `.ultraThinMaterial` in a `RoundedRectangle` with mode-aware border.

### `GaugeIcon` — the SwiftUI Canvas gauge

The most directly transplantable component for Token Rats. `Presentation/Components/GaugeIcon.swift`:
- 180° arc gauge drawn with `Path.addArc`
- Color gradient: green → cyan → blue → orange → red by percentage
- Needle + animated shimmer in the loading state
- Rendered to NSImage via `ImageRenderer` in `StatusBarDisplayManager`

## State and persistence

- `SettingsManager` is `@Observable` and acts as a **facade** delegating to four component managers (Session, Display, SpendingLimits, AppBehavior), each owning its own UserDefaults keys.
- Documented keys: `selectedCurrencyCode`, `refreshIntervalMinutes`, `menuBarDisplayMode`, `warningLimitUSD`, `upperLimitUSD`, `launchAtLoginEnabled`, `showInDock`, `enabledProviders`, `providerSessions`.
- `GRDB.swift` for SQLite — cached invoices, Claude log parsing results.
- `KeychainAccess` for OAuth/cookie tokens, one helper per provider (`AuthenticationTokenManager` dispatches by provider).
- Cursor session cookies extracted via `WKWebView` (`LoginWebViewManager`) — load auth URL, await navigation, call `httpCookieStore.getAllCookies`, match by `authCookieName`, store in Keychain.

## Multi-provider orchestrator (adaptive polling)

`MultiProviderDataOrchestrator.swift`:
- **Claude**: 60s if ≥90% used, 120s if 70-89%, 180s if 50-69%, else ≥5 min — adaptive based on usage proximity to limit.
- Other providers: fixed `refreshIntervalMinutes`.
- `withTaskGroup` for concurrent refresh, sequential 0.5s-staggered initial fetches to avoid I/O spikes.
- `AsyncTimerSequence.seconds()` for fixed-interval providers.
- Per-provider error isolation: one provider's failure doesn't kill others.

## Token-counting pipeline (the part Token Rats overlaps with)

### Claude local log parser

`VibeMeter/Core/Services/ClaudeCodeLogParser.swift` decodes each JSONL line into:

```swift
struct ClaudeCodeFormat: Decodable {
    let timestamp: String
    let version: String?
    let message: Message
    let costUSD: Double?
    let type: String?
    let parentUuid: String?
    struct Message: Decodable {
        let model: String?
        let usage: Usage?
        struct Usage: Decodable {
            let input_tokens: Int?
            let output_tokens: Int?
            let cache_creation_input_tokens: Int?
            let cache_read_input_tokens: Int?
        }
    }
}
```

Timestamp parsing falls back through `ISO8601DateFormatter`, then two custom formats: `"yyyy-MM-dd'T'HH:mm:ss.SSSZ"` and `"yyyy-MM-dd'T'HH:mm:ssZ"`. Notably **no `requestId` field** — the original VibeMeter dedupe was coarser than CodexBar's.

### Pricing table (hardcoded fallback)

`PricingDataManager.swift` carries a hardcoded fallback table with per-token rates (already divided by 1e6). Date-suffix normalization is brittle string surgery:

```swift
.replacingOccurrences(of: "claude-3-5-sonnet", with: "claude-3.5-sonnet")
// tries variations: model, "anthropic/\(model)", "claude-3-5-\(model)", "claude-3-\(model)", "claude-\(model)"
// fallback: if lowerModel.contains("sonnet") { ... }
```

CodexBar replaced this entire approach with live `models.dev` lookups.

### Two-tier cache

`ClaudeLogProcessor.swift` + `ClaudeLogCacheManager.swift` + `ClaudeLogRecord.swift`:
- **Transient in-memory**: 300s TTL general, 10s for the current 5-hour window
- **Permanent SQLite (GRDB)**: table `claude_logs` with unique `(conversation_id, timestamp)`; indexes on `timestamp`, `model`, `file_hash`; schema version `7`
- **File-hash dedupe**: each JSONL is SHA-256-hashed. For files ≥ 2KB, **only first and last 1KB are hashed** (Claude Code JSONL is append-only). If hash matches, file is skipped entirely.
- **Permanent cache eligibility**: only entries strictly before today are persisted; today's file stays transient.
- Concurrency: `TaskGroup` capped at `min(4, ProcessInfo.processInfo.activeProcessorCount)`.

### Sliding 5-hour window

`ClaudeFiveHourWindowCalculator.swift`:
```swift
let fiveHoursAgo = now.addingTimeInterval(-5 * 60 * 60)
entries.filter { $0.timestamp >= fiveHoursAgo }
```
Free-tier accounts reset at midnight America/Los_Angeles instead.

### The SIMD tokenizer (now removed)

The 2025 blog post documents a custom SIMD16-accelerated BPE tokenizer using OpenAI's `o200k_base` vocab, used to *approximate* Claude tokens. **This code was deleted in the migration to CodexBar** because the `usage` field in JSONL provides canonical counts — re-tokenizing prompts was over-engineering. Lesson: trust the upstream counts.

## Distribution

- **Signed + notarized DMG** via GitHub Releases (no Homebrew cask for VibeMeter)
- Sparkle EdDSA-signed appcast:
  - Prerelease: `https://stats.steipete.com/api/v1/appcast/appcast-prerelease.xml` (proxied through his own stats.store)
  - Stable: `appcast.xml` in repo root
- Public key: `oIgha2beQWnyCXgOIlB8+oaUzFNtWgkqq6jKXNNDhv4=`
- `scripts/release.sh` orchestrates: preflight → build → sign+notarize → DMG → appcast → GitHub Release → tag/push
- **Sandboxed** (unlike CodexBar) with `temporary-exception.files.home-relative-path.read-only` for `~/.claude/`, plus the `-spks/-spkd` Mach-lookup exceptions Sparkle's XPC requires under sandbox.

## What to take for Token Rats

1. **`StatusBarController` + 6 managers split** is overkill day one but pays off as the menu adds animation, tooltips, accessibility, and modal interactions. Keep the split in mind as the menu bar grows.
2. **`GaugeIcon` is directly portable** — copy the SwiftUI Canvas code and switch the percentage source from "spend" to "token budget" or "leaderboard rank delta."
3. **Adaptive polling intervals based on usage proximity** are the right pattern: poll faster when the user is close to a limit, slower when idle. See [`token-counting-deep-dive.md`](./token-counting-deep-dive.md).
4. **`CustomMenuWindow`'s Bartender fallback positioning** is a non-obvious detail worth copying — users with menu-bar hiders will otherwise see broken popovers.
5. **The two-tier cache (transient memory + permanent SQLite) gated by "today vs. before today"** is a clean model. Token Rats already does daily rollup on the Worker — adopt the same client-side split if the menu bar needs offline-first.
6. **Don't tokenize prompts.** The `usage` field is authoritative; estimating from `o200k_base` is brittle and was deleted.
7. **Don't keep a hardcoded `prices.json` as primary source.** See [`proposals.md`](./proposals.md) for the `models.dev` migration plan — Steinberger learned this lesson the slow way.

## Key file references

- App entry: https://github.com/steipete/VibeMeter/blob/main/VibeMeter/App/VibeMeterApp.swift
- AppDelegate (single-instance, Sparkle wiring): https://github.com/steipete/VibeMeter/blob/main/VibeMeter/App/AppDelegate.swift
- `CustomMenuWindow`: https://github.com/steipete/VibeMeter/blob/main/VibeMeter/Presentation/Components/CustomMenuWindow.swift
- `GaugeIcon`: https://github.com/steipete/VibeMeter/blob/main/VibeMeter/Presentation/Components/GaugeIcon.swift
- `StatusBarDisplayManager`: https://github.com/steipete/VibeMeter/blob/main/VibeMeter/Presentation/Components/StatusBarDisplayManager.swift
- `StatusBarAnimationController`: https://github.com/steipete/VibeMeter/blob/main/VibeMeter/Presentation/Components/StatusBarAnimationController.swift
- `MultiProviderDataOrchestrator`: https://github.com/steipete/VibeMeter/blob/main/VibeMeter/Core/Services/MultiProviderDataOrchestrator.swift
- `ClaudeCodeLogParser`: https://github.com/steipete/VibeMeter/blob/main/VibeMeter/Core/Services/ClaudeCodeLogParser.swift
- `PricingDataManager`: https://github.com/steipete/VibeMeter/blob/main/VibeMeter/Core/Services/PricingDataManager.swift
- `release.sh`: https://github.com/steipete/VibeMeter/blob/main/scripts/release.sh
- Entitlements (sandboxed with `~/.claude/` read exception): https://github.com/steipete/VibeMeter/blob/main/VibeMeter/VibeMeter.entitlements
