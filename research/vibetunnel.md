# Research: VibeTunnel

**Research date:** 2026-05-18

- **Repo:** https://github.com/amantus-ai/vibetunnel
- **Stars:** 4,502
- **License:** MIT
- **Platform:** macOS (Apple Silicon only for Mac app) + Linux/headless via npm
- **Author:** primary work by Steinberger via the `amantus-ai` org

## What it is

A "terminal-in-the-browser" tool. Runs a native macOS menu-bar app and an npm-published Node service that proxies any local terminal session to a browser, designed specifically for monitoring AI agents remotely. The Mac app handles permissions, AppleScript integration, dashboard auth, and notifications; the `vt` CLI wrapper is the user-facing entry point.

**Not directly relevant to Token Rats's product, but the most polished reference in the steipete orbit for:**
- Multi-channel distribution (Mac app + npm CLI + Homebrew cask)
- 9-page first-run Welcome flow
- App-bundled CLI installer with sudo elevation via osascript
- GitHub-Actions-based release workflow (the only steipete project that builds in CI)

## Tech stack

- Mac app: Swift / SwiftUI
- Backend / cross-platform CLI: TypeScript (npm-published `vibetunnel`)
- Smart `vt` shell wrapper that resolves aliases and detects which install variant the user has
- Uses Poltergeist for hot reload during development
- Companion landing page (`vibetunnel-landing`) and Discord for community

## Distribution — the three-channel parallel pattern

1. **`brew install --cask vibetunnel`** — note: in **homebrew-core**, not Steinberger's tap. This is the only steipete app that made it into core.
2. **GitHub Releases DMG** — Apple Silicon only for the Mac app
3. **`npm install -g vibetunnel`** — Linux/headless fallback

The `vt` CLI is "smart" — if you `npm install -g vibetunnel` on a Mac that also has `/Applications/VibeTunnel.app`, the npm-installed `vt` detects the app bundle and forwards to its native binary for best experience. Cross-channel cohesion is rare and worth copying when shipping multi-variant tools.

## Release workflow — the only CI-based release in the orbit

`.github/workflows/release.yml`:
- Builds matrix on `macos-15`
- Separate `arm64` + `x86_64` builds
- Uses `softprops/action-gh-release@v2` to publish drafts
- Auto-detects beta/rc from the tag name (`v1.2.3-beta.1` → marked prerelease)
- Defers notarization to scripted helpers shared with Steinberger's other projects

This is the exception — CodexBar, RepoBar, VibeMeter all release from a developer laptop because the signing keys + Sparkle private key live locally and the Steinberger philosophy is "fewer secrets in CI." VibeTunnel has a bigger team so CI makes more sense.

## The 9-page Welcome flow

`mac/VibeTunnel/Presentation/Views/WelcomeView.swift` is a SwiftUI carousel with these pages:

1. App intro — "what is VibeTunnel"
2. `vt` CLI install — runs `CLIInstaller` that prompts for sudo via system dialog to symlink into `/usr/local/bin`
3. AppleScript permission
4. Terminal picker (which app to use as default)
5. Project folder selection
6. Dashboard authentication setup
7. Notification permission
8. "Control your agent army" — feature tour
9. Remote access setup

Persisted via `@AppStorage("welcomeVersion")` so it only runs once but can be re-triggered on major version upgrades.

**This is too much onboarding for Token Rats.** CodexBar deliberately has *none* — just opens a menu bar icon and lets the user enable providers in Settings. For a focused widget, copy CodexBar's minimalism, not VibeTunnel's.

## `CLIInstaller` — the cleanest auto-update-symlink pattern

`mac/VibeTunnel/Utilities/CLIInstaller.swift`:
- On install: writes the wrapper script to `/usr/local/bin/vt` via osascript sudo prompt
- On every app launch: reads the script content and matches it against a regex to detect "outdated CLI"; if mismatch, prompts the user to reinstall
- Handles version drift between the app and the CLI without forcing a user to remember to reinstall

This is the cleanest answer to the "users install the app, then a year later the CLI behavior changes" problem.

## What to take for Token Rats

| Pattern | Token Rats application |
|---|---|
| Three-channel distribution (Mac app + brew + npm) | Already npm; add brew now (Phase 1 in [`proposals.md`](./proposals.md)); add Mac app later as Phase 2 |
| Smart CLI wrapper that detects native bundle | If the future Mac widget bundles a CLI, the npm `token-rats` should detect `/Applications/TokenRats.app` and forward |
| GitHub-Actions release workflow (when team scales) | Skip for now; release from a dev laptop matches Steinberger's other apps |
| 9-page welcome carousel | **Do NOT copy.** Onboarding overload; use CodexBar's minimal "click to sign in" instead |
| `CLIInstaller` with version-drift detection | If/when Token Rats ships a Mac widget with an app-bundled CLI, copy this pattern; otherwise irrelevant |
| `softprops/action-gh-release@v2` for draft releases | Useful regardless — easier than `gh release create` in CI |

## Key file references

- Welcome flow: https://github.com/amantus-ai/vibetunnel/blob/main/mac/VibeTunnel/Presentation/Views/WelcomeView.swift
- CLI installer: https://github.com/amantus-ai/vibetunnel/blob/main/mac/VibeTunnel/Utilities/CLIInstaller.swift
- Release workflow: https://github.com/amantus-ai/vibetunnel/blob/main/.github/workflows/release.yml
- README structure (TOC, install matrix, why, architecture, permissions, support): use as a template for Token Rats's eventual marketing README
