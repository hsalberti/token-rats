# Research: BlackBar

- **Site:** https://black.bar
- **Repo:** https://github.com/steipete/blackbar
- **Author:** Peter Steinberger (@steipete) — same author as CodexBar
- **License:** MIT (`LICENSE` at repo root)
- **Platform:** macOS 14+, Swift / AppKit (with a small Shell + Makefile)
- **Pricing:** free + open source

## What it is

**Not a token tracker.** BlackBar is a native macOS menu-bar app that displays [Blacksmith](https://blacksmith.sh) CI runner status: public forge status, active vCPU counts, job counts broken down by platform (amd64 / arm64 / macOS), and an 18-bar history graph of recent activity. It is an independent third-party tool — explicitly *not* affiliated with Blacksmith — built by a Blacksmith customer to avoid clicking through the dashboard.

It is in scope for us because (a) the user asked, and (b) it is the **architectural sibling** of CodexBar — same author, same shape (menu-bar + Keychain + minimal endpoints), so it is the cleanest reference for *how to ship a small native macOS companion app well*.

## How it accesses data

Direct peer-to-peer; no proxy, no SDK, no telemetry backend. The app hits two endpoints only:

1. `status.blacksmith.sh/summary.json` — public status feed, no auth.
2. `app.blacksmith.sh` — authenticated user dashboard. Auth is a Blacksmith **session cookie** stored in **macOS Keychain**.

GitHub OAuth is used at first launch to obtain that session; nothing else is persisted.

## What we can copy under MIT

The repo is MIT-licensed (same notes as CodexBar — see `research/codexbar.md`). We can fork, vendor, port-to-TS, and reuse the implementation as long as we preserve the copyright notice + MIT text. Specifically reusable for us:

- **The "minimal native companion" architecture** — single binary, Keychain for the session cookie, two endpoints. If we ever ship a native helper alongside our Worker + web app, this is the template.
- **The Keychain session pattern** — directly translatable to how a future native Token Rats helper would persist its GitHub OAuth session.
- **The 18-bar activity sparkline** — the visual idea (not the SwiftUI code) is exactly what our **Track Q** per-source tile needs.
- **The independent-third-party-tool disclaimer copy** — almost verbatim usable when we ship sources that touch trademarks (Claude, Cursor, Codex, etc.).

## What we should NOT copy

- **The name "BlackBar" and Blacksmith logos / branding** — not covered by MIT.
- **The product itself** — wrong domain; nothing in BlackBar's data model maps to ours. The takeaway is the *shape* of the app, not the contents.

## Concrete take-aways for our roadmap

1. **No new track needed.** BlackBar is reference architecture, not a feature we are mirroring.
2. **Track Q (rich profile)** — borrow the 18-bar activity sparkline shape for per-day tiles when 30 days is too dense.
3. **Future native helper (out of scope today)** — if we ever ship a Mac menu-bar companion to surface live leaderboard deltas, BlackBar's two-endpoint + Keychain pattern is the template. Note for `roadmap.md`'s "explicitly deferring" section if the discussion comes up.
4. **Trademark disclaimer copy** — pre-write a "Token Rats is an independent tool, not affiliated with Anthropic / OpenAI / Cursor" notice in the spirit of BlackBar's, and surface it in the CLI README and the web `/about` page.

## Action items

- [ ] None blocking. File this as architectural reference reading for whoever picks up a future native helper.
