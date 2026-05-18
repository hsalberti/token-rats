# Research: Trimmy

**Research date:** 2026-05-18

- **Repo:** https://github.com/steipete/Trimmy
- **Stars:** 692
- **License:** MIT
- **Platform:** macOS 15+, Swift 6.2, pure SwiftUI Package (SPM-only)

## What it is

A clipboard utility that flattens multi-line shell snippets when copied so they paste & run cleanly. Tiny — maybe 1,500 lines of Swift total. **The cleanest reference implementation of SwiftUI's native `MenuBarExtra` API in Steinberger's catalog**, and the only menu-bar app of his that doesn't use AppKit `NSStatusItem`.

If Token Rats builds a menu-bar widget and the design goals are "small, focused, no fancy custom popover," start by reading Trimmy.

## Tech stack

- Swift 6.2, macOS 15+
- Pure SwiftUI Package (`Package.swift`), SPM-only build
- Dependencies (`Package.swift`):
  - `sparkle-project/Sparkle` ≥ 2.8.1
  - `sindresorhus/KeyboardShortcuts` ≥ 1.16
  - `orchetect/MenuBarExtraAccess` exactly 1.2.2 — adds programmatic control (open/close) to SwiftUI's MenuBarExtra, which doesn't expose that by default. Worth knowing.

## Menu bar pattern — copy this for Token Rats v0.1

`@main struct TrimmyApp: App` has **two Scenes**:
1. `MenuBarExtra { menu } label: { Image(systemName: "scissors") }` — the menu itself
2. `Settings { SettingsView() }` — Cmd-, opens this

The label uses hierarchical SF Symbol rendering, toggling primary/secondary appearance based on the `autoTrimEnabled` boolean (so the icon visually reflects on/off state).

- `@StateObject` for long-lived managers (`ClipboardMonitor`, `HotkeyManager`, `AccessibilityPermissionManager`)
- `@State` for transient (`isMenuPresented`)
- `MenuBarExtraAccess` gives an `isMenuPresented` binding to imperatively close the menu after an action

## Why `MenuBarExtra` vs. NSStatusItem?

| | SwiftUI `MenuBarExtra` | AppKit `NSStatusItem` (VibeMeter / CodexBar / RepoBar) |
|---|---|---|
| Boilerplate | Minimal — 2 Scenes in `@main App` | Heavy — `StatusBarController` + 6 managers (VibeMeter pattern) |
| Custom popover content | Limited — SwiftUI views fine, but no `NSPanel`-level control | Total — `CustomMenuWindow` borderless NSPanel with full styling control |
| Bartender/Ice hidden-icon fallback | Built-in (mostly) | Must be implemented manually (VibeMeter does) |
| Animated icon (gauge, sparkline) | Possible but awkward | Easy via `ImageRenderer` + `setNeedsDisplay` (VibeMeter pattern) |
| Programmatic open/close | Requires `MenuBarExtraAccess` library | Native |
| Multi-status-item ("Merge Icons" off in CodexBar) | Awkward | Easy — multiple `NSStatusItem`s |

**For Token Rats v0.1 widget**, `MenuBarExtra` is the right answer. If the design grows to need a custom-rendered gauge icon or per-provider sub-status-items, graduate to AppKit per the VibeMeter pattern.

## State

- Pure `@AppStorage` / UserDefaults (`AppSettings.swift`)
- **Clipboard markers** — sets a `com.steipete.trimmy` flag on its own pasteboard output so the monitor doesn't re-process its own writes. Cycle-breaker pattern, useful any time you observe a system event you also produce.

## Privacy posture

`Telemetry.swift` is just `OSLog` `Logger` instances — **local logging only, no network calls except Sparkle's update check.** README explicitly states "No telemetry, no auth, no network calls except Sparkle's update check." Identical posture to Token Rats's "counts only, never content" rule.

## Distribution

- Brew cask in steipete/homebrew-tap
- Signed ZIP via GitHub Releases
- Sparkle 2 EdDSA appcast
- Same `Scripts/release.sh` pattern as CodexBar
- **Disabled updater controller in dev/debug** — a protocol-based `UpdaterControlling` with a `DisabledUpdaterController` no-op for unsigned/debug builds so Sparkle dialogs don't spam during development. **Copy this pattern for any future Token Rats Mac app.**

## What to take for Token Rats

1. **Use SwiftUI `MenuBarExtra` + a `Settings` Scene, exactly like Trimmy** for v0.1 of any Token Rats menu-bar widget. Two Scenes in `@main struct TokenRatsApp: App`. Use `MenuBarExtraAccess` for programmatic open/close. This is the simplest path. Only graduate to AppKit `NSStatusItem` + `CustomMenuWindow` (the VibeMeter pattern) if you hit limitations.

2. **Dependency floor**: Sparkle ≥ 2.8, KeyboardShortcuts (sindresorhus), MenuBarExtraAccess. That's enough to build the minimum-viable widget.

3. **Hierarchical SF Symbol toggling** for icon state — primary appearance when active, secondary when paused/disconnected. Free visual state without custom rendering.

4. **`DisabledUpdaterController` protocol pattern** — debug builds get the no-op; release builds get real Sparkle. Stops dev-time dialog spam.

5. **Use `@StateObject` for long-lived managers (singletons in disguise), `@State` for UI transients.** Same split applies to React if you ever do this in Electron instead.

## Key file references

- App entry (cleanest MenuBarExtra example): https://github.com/steipete/Trimmy/blob/main/Sources/Trimmy/TrimmyApp.swift
- Package.swift: https://github.com/steipete/Trimmy/blob/main/Package.swift
