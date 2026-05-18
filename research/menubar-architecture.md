# Cross-cutting analysis: macOS menu-bar architecture patterns

**Research date:** 2026-05-18

Patterns and decisions extracted from VibeMeter, CodexBar, RepoBar, Trimmy, and BlackBar — Steinberger's five macOS menu-bar apps. Per-app deep dives live in the individual files; this is the cross-cutting "if you build a menu bar app, here's what 5 examples taught us."

## Two architectures, pick by complexity

| | SwiftUI `MenuBarExtra` (Trimmy) | AppKit `NSStatusItem` + custom popover (VibeMeter, CodexBar, RepoBar, BlackBar) |
|---|---|---|
| **Setup** | `@main struct App: App { var body: some Scene { MenuBarExtra { menu } label: { Image(systemName: "scissors") } } }` — done | `StatusBarController` class + 6 specialized managers (display, menu, animation, observer, tooltip, accessibility) |
| **Custom popover** | SwiftUI views only; NSPanel-level control not exposed | Full `NSPanel` styling via `CustomMenuWindow` |
| **Animated icon** | Awkward — possible via `Image` redraws | Easy via `ImageRenderer` + `setNeedsDisplay`; LRU icon cache keyed on state |
| **Multi-status-item** ("Merge Icons" off) | One per `MenuBarExtra` Scene; awkward to compose | Easy — create N `NSStatusItem` instances |
| **Bartender/Ice hidden-icon fallback** | Mostly built-in | Must implement manually (VibeMeter does) |
| **Programmatic open/close** | Needs `orchetect/MenuBarExtraAccess` lib | Native |

**Recommendation:** start with SwiftUI `MenuBarExtra` (Trimmy pattern). Only graduate to AppKit `NSStatusItem` (VibeMeter pattern) if you need animated icons or multi-status-item layouts.

## The 6-manager split (VibeMeter)

When the app outgrows `MenuBarExtra`, VibeMeter's split is the right decomposition:

```
StatusBarController (owns NSStatusItem)
├── StatusBarDisplayManager      → icon rendering + LRU cache (max 50 entries, quantized to Int(value*100))
├── StatusBarMenuManager         → left-click popover vs right-click NSMenu
├── StatusBarAnimationController → adaptive frame rate (30fps animating, 3fps idle, skip after 10s)
├── StatusBarObserver            → @Observable subscriptions → setNeedsDisplay
├── StatusBarTooltipProvider     → tooltip text
└── StatusBarAccessibilityProvider → VoiceOver labels
```

Adaptive animation rates keep the app at near-0% CPU when idle.

## `CustomMenuWindow` — VibeMeter's polished popover replacement

The default `NSStatusItem` popover has limitations (sizing, behavior, styling). `CustomMenuWindow.swift` is a borderless `NSPanel` with:

- `styleMask: [.borderless, .nonactivatingPanel, .utilityWindow]`
- `level = .popUpMenu`
- `collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .transient]`
- `hidesOnDeactivate = false` (critical — don't hide when app loses focus, since menu bar apps never have focus)
- 12pt corner radius
- `.ultraThinMaterial` background
- **Bartender/Ice hidden-icon fallback** — when `buttonFrameInScreen.width == 0` (icon is hidden by a third-party menu manager), pop at top-right of screen instead of trying to anchor to nothing
- Global mouse-down monitor (`NSEvent.addGlobalMonitorForEvents`) to dismiss on outside click
- Multi-strategy show (`orderFrontRegardless` → `makeKeyAndOrderFront` → fallback) to dodge a SwiftUI-in-AppKit first-show hang

This is ~150 lines of Swift and is the highest-leverage chunk to copy.

## The `GaugeIcon` SwiftUI Canvas pattern

VibeMeter's gauge is the most directly transplantable component:
- 180° arc drawn with `Path.addArc`
- Color gradient: green → cyan → blue → orange → red by percentage
- Needle + animated shimmer in loading state
- Rendered to NSImage via `ImageRenderer` in `StatusBarDisplayManager`
- `nsImage.isTemplate = true` for system dark/light tinting

Token Rats use cases:
- Token budget gauge (% of daily quota used)
- Leaderboard rank gauge (top 1% → green, top 50% → blue, etc.)
- Reset countdown ring (segments fill as the 5-hour window approaches reset)

## Background behavior — the "menu bar app done right" checklist

- **`LSUIElement = true`** in Info.plist (no Dock icon) — always
- **Optional "Show in Dock" toggle** that flips `NSApp.setActivationPolicy(.regular | .accessory)` at runtime
- **Launch at login** via `SMAppService.mainApp.register()` (and `.unregister()`) — replaces the deprecated `SMLoginItemSetEnabled`
- **Single-instance enforcement** via `NSRunningApplication.runningApplications(withBundleIdentifier:)` + `DistributedNotificationCenter` to bring forward the existing instance and terminate the duplicate
- **`ApplicationMover`** — prompt the user once to move the app from Downloads to /Applications. Indie-app polish.
- **Settings open via `NSApp.openSettings()`** — VibeMeter's CLAUDE.md flags this as "the only reliable way to show settings"
- **Strict Swift 6 concurrency** from day one (`.enableUpcomingFeature("StrictConcurrency")`) — every target's `swiftSettings`. You'll regret deferring.
- **`@Observable` (Swift 5.9+), not Combine** — VibeMeter calls this out explicitly. Less boilerplate, better ergonomics.

## Auth storage — Keychain (release) / file (debug)

RepoBar's split is the right pattern. Release builds use Keychain via `KeychainAccess` or Security.framework directly. Debug builds default to a flat file at `~/Library/Caches/<app>/auth.json` so developers don't get a Keychain UI prompt every time they `swift run` or `swift test`. The release checklist explicitly verifies the `<app>TokenStore=file` Info.plist key is **absent** from shipped binaries.

**Keychain cache:** BlackBar caches Keychain unlocks in-memory during polling cycles to avoid repeated prompts. First read prompts; subsequent reads from in-memory cache. Important for any app polling auth every 60s.

## State persistence — three tiers

Across all five apps, persistence breaks into:

1. **UI prefs → `@AppStorage` / UserDefaults** (settings, intervals, display modes)
2. **App data → SQLite (GRDB.swift)** (cached invoices, parsed log results, leaderboard rows)
3. **Secrets → Keychain** (OAuth tokens, session cookies, browser Safe Storage decryption keys)

Token Rats's menu bar widget should adopt the same split if/when built.

## Sandbox vs. non-sandboxed

| | Sandboxed (VibeMeter) | Non-sandboxed (CodexBar, RepoBar) |
|---|---|---|
| App Store eligibility | Yes | No (Developer ID only) |
| `~/.claude/` access | Needs `temporary-exception.files.home-relative-path.read-only` | Just works |
| Sparkle XPC | Needs `-spks` AND `-spki` Mach-lookup exceptions (Apple's #1 gotcha) | Just works |
| User trust footprint | Higher | Slightly lower |

**Recommendation for Token Rats menu bar widget:** non-sandboxed, Developer ID only. The parsers need disk access to `~/.claude/`, `~/.cursor/`, etc. Sandboxing forces you into per-file user-selected reads. Match CodexBar.

## Sparkle is auto-disabled in Homebrew installs

CodexBar's `InstallOrigin.swift` (~4 lines) detects when the app bundle path contains `/Caskroom/` and swaps in a `DisabledUpdaterController` no-op. Brew users update via `brew upgrade --cask <app>`. This avoids "two update mechanisms fighting." **Copy this — it's 4 lines.**

## Disabled updater in debug builds

Trimmy / CodexBar both protocol the updater (`UpdaterControlling`) with a `DisabledUpdaterController` no-op for unsigned/debug builds. Stops the Sparkle "check for updates" dialog from spamming during development. Another 10-line copy.

## Small details consistently worth copying

- **Cycle-breaker markers** — Trimmy tags its own pasteboard writes with `com.steipete.trimmy` so its clipboard monitor doesn't reprocess them. Useful any time you observe a system event you also produce.
- **Hierarchical SF Symbol toggling** for icon state — Trimmy uses primary/secondary appearance to indicate on/off without custom rendering.
- **Currency-change-triggers-immediate-reset** — VibeMeter's title doesn't animate from "$12" to "€11" when you change currency; it resets without animation so the user doesn't see a weird tween.
- **`peekaboo permissions status/grant` style subcommands** in any CLI — let users diagnose without trial-and-error.

## Where the patterns map onto Token Rats

| Pattern | Token Rats v0.1 (focused widget) | Token Rats v2 (rich dashboard) |
|---|---|---|
| MenuBarExtra (Trimmy) | ✅ Adopt | — |
| 6-manager NSStatusItem split (VibeMeter) | — | ✅ Adopt when icon gets animation |
| GaugeIcon Canvas | — | ✅ Adopt for token-budget gauge |
| CustomMenuWindow | — | ✅ Adopt when popover content outgrows native menus |
| LSUIElement, launch at login, single-instance | ✅ All required | — |
| Keychain (release) / file (debug) auth | ✅ Required | — |
| Cache-first opening (SQLite seed → bg refresh) | ✅ Adopt — feels instant | — |
| `models.dev` for pricing | ✅ Required regardless of widget | — |
| Sparkle 2 EdDSA appcast + brew-install detection | ✅ Required | — |
| Disabled updater in debug | ✅ 10 lines, do it | — |

See [`proposals.md`](./proposals.md) for the prioritized implementation plan.
