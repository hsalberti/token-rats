# Deferred roadmap

Tasks deliberately punted out of the active roadmap. Captured here so they're
not forgotten when we revisit the install / onboarding surface.

## Node-free install path for the CLI

**Problem.** `npx token-rats …` assumes Node is on `PATH`. Non-developer
users (most commonly on macOS) hit "command not found: npx" immediately —
see the `NodeInstallHint` component for the in-page mitigation we shipped.
The mitigation is a polite signpost, not a fix; the user still has to
install a runtime before they can sync.

**Goal.** Let a user install and run `token-rats` without first installing
Node themselves.

**Options to evaluate:**

- **Homebrew tap** (`brew install token-rats/tap/token-rats`). Ship a
  prebuilt single-file binary (Bun or pkg/esbuild + node18 SEA) for
  `darwin-arm64`, `darwin-x64`, `linux-x64`, `linux-arm64`. macOS is the
  priority since that's where the gap was reported.
- **`curl … | sh` installer** mirroring the binary, for users without
  Homebrew. Same prebuilt artefacts as the tap.
- **Windows: winget / Scoop manifest** pointing at the same release
  artefacts.
- **GitHub Releases** as the source of truth for the binaries, built by a
  release workflow alongside the npm publish.

**Open questions:**

- Does the CLI's filesystem-walking code (Claude Code + Cursor log
  discovery) work cleanly under a SEA / Bun single-file build? Worth a
  spike before committing.
- Signing/notarisation on macOS — needed to avoid Gatekeeper noise. Cost
  + cert ownership TBD.
- How do we keep the npm-distributed CLI and the binary in version
  lockstep without doubling the release surface?

**Why deferred.** Real build-pipeline + release-infra work. The
`NodeInstallHint` covers the immediate UX bleed for ~2 lines of code; the
binary path is worth doing properly when we have a stretch to spend on
release engineering.

## Pro-tier org Stripe checkout email on approval

**Problem.** Approving a pro-tier org today just flips `orgs.status` to
`'approved'` — the founder gets the same end state as a student-tier org
and no billing is collected. That's fine for the soft-launch (we're not
turning on Stripe yet) but it's the missing half of the "pro" tier.

**Goal.** When admin approves an org whose `requested_plan='pro'`, send the
founder a Stripe Checkout link via Resend (or wire a one-time link in the
approval response). On successful checkout, set `orgs.plan='pro'` and
populate `stripe_customer_id` / `stripe_subscription_id`.

**Why deferred.** Mission.md keeps paid features "architected for, not
built" until the student-tier cohort gives D7 retention signal. Wiring
Stripe checkout + the webhook handler for org subscriptions is real work
that we shouldn't do until we know there's demand. The soft-create flow
already records `requested_plan`, so this is purely additive when we
revisit.

## Automated email sending (Resend + weekly digest + unsubscribe)

**Problem.** `users.email` is now captured (see the shipped email-capture
feature) but nothing actually sends mail. `apps/api/src/lib/email.ts` is
still a stub that logs the intent; `apps/api/src/scheduled.ts` is an
explicit no-op. The Monday `0 16 * * 1` cron in `wrangler.toml` runs and
returns immediately. Until this lands, any outreach is done manually
against the captured email list.

**Goal.** Deliver the weekly digest (and any future transactional emails)
via a real ESP, with a working unsubscribe link.

**Scope to revisit:**

- **Resend wiring.** Replace `sendEmail` stub with a real Resend call.
  Decide on sandbox vs verified domain (the recommendation is
  `noreply@tokenrats.com` with full SPF + DKIM + DMARC for inbox
  placement).
- **Cron handler.** Restore `runWeeklyDigests` to iterate users with an
  email + a non-empty 7-day rollup, call `buildWeeklyDigest`, and send.
  Replace the sequential `await sendEmail` loop with a Cloudflare Queues
  fan-out before this scales past a few hundred users.
- **Unsubscribe.** Add `POST /v1/notifications/unsubscribe?token=<signed>`
  (HMAC over `(user_id, scope)`) that flips a notification preference
  bit. v1 is link-only — no `/settings/notifications` toggle to manually
  re-subscribe; revisit if the lack of a manual flip causes confusion.
- **Notification preferences schema.** Either a single
  `users.email_unsubscribed_at` timestamp (coarse) or a
  `user_notification_prefs` table keyed on `(user_id, category)`. The
  current notifications routes don't have an email category yet.

**Why deferred.** The user prefers to send outreach manually from the
captured list until there's a clear digest worth automating. Email
deliverability + domain verification work is real, and shipping a
half-working digest is worse than no digest. Capture-only ships first;
sending follows once the audience is large enough to be worth a real
ESP integration.

## Primary-source pill (full pipeline)

**Problem.** Helpers + component are shipped (`apps/api/src/lib/primary-source.ts`,
`apps/web/components/SourcePill.tsx` with `<PrimarySourcePill>`) but the
underlying data pipeline is missing — there is no `sessions.source_plan`
column, no parser code that infers the plan tier, and the ingest path
doesn't carry `sourcePlan`. The helper as written would error if anyone
called it against today's schema. The component renders nothing because
no response shape carries a `primarySource` label. "Frontend wiring" in
the original roadmap line undersold the work; it's a full
detect→store→render pipeline.

**Goal.** When ≥50% of a user's 30d USD cost came from a single
`(source, sourcePlan)` combination, render a small kebab-case pill
("claude-max", "cursor-ide", "codex-api") next to their handle on the
agreed render sites.

**Scope to revisit (decisions already made, just not implemented):**

- **Migration.** Add `sessions.source_plan TEXT` (nullable, default
  `NULL` for back-compat).
- **Parsers.** Add filesystem-only detection: presence of an OAuth
  credentials file (claude max / pro) vs an `~/.anthropic` API key file,
  Cursor's settings file, Codex's credentials file. Log-content
  heuristics are explicitly **out of scope** — too fragile.
- **CLI + ingest.** Extend `SessionRecord` (in `packages/contracts`)
  with `sourcePlan: 'max' | 'pro' | 'api' | 'ide' | 'unknown' | null`.
  Ingest validates + writes to `sessions.source_plan`.
- **Server-side compute.** Call `getPrimarySourceMap` on the response
  shapes that render the pill; attach `primarySource: string | null` to
  each row.
- **Render sites (v1).** Mirror the Twitter-pill scope: `/u/<handle>`,
  `/r/<code>` member list, `/app/friends`. **Leaderboard, trending, OG
  cards are explicitly out of scope** in v1 to keep the contract
  surface small.
- **Threshold.** Keep the existing `>= 50%` hard-coded rule. No split
  pill; below threshold → no pill rendered.

**Why deferred.** The work is real (parser code + migration + contract
diff across CLI/web/api + render wiring on three pages) and the user
chose to keep the helper + component dormant rather than ship a
half-pipeline. When we revisit, the decisions above mean the
implementation plan is already locked — no new design questions, just
execution.

## iOS Safari web-push surface

**Problem.** The Web Push payload-encryption feature ships supporting
Chrome desktop + Android only. On iOS Safari, the test-push button
silently no-ops because Apple's web-push implementation only works for
installed PWAs on iOS 16.4+, and we haven't built the install-prompt
contextual UX. iOS users won't know why nothing is happening.

**Goal.** When an iOS Safari visitor (or any browser without push
support) hits `/settings/notifications`, show contextual UX that
explains the situation and, where possible, offers a path forward
(PWA install prompt for iOS 16.4+).

**Scope to revisit:**

- Feature-detect `'Notification' in window && 'PushManager' in window`
  on the client.
- If unsupported, hide the test-push button and show a "Push isn't
  available on this browser" line. iOS Safari specifically gets an
  install-to-home-screen prompt (we already render `manifest.ts`).
- After install + relaunch as PWA, the push flow resumes normally.

**Why deferred.** Low priority — Chrome desktop + Android cover the
primary persona (vibe coders on Mac / Linux / Android). The iOS PWA
install dance adds UX surface we haven't designed and would slow the
core push feature down. Revisit once we have D7 retention data
suggesting iOS users are a meaningful slice we're losing.

## Taskbar app (Tauri 2.x, macOS + Windows)

**Problem.** No always-visible surface for token-burn stats. Users have
to actively visit the web app to see today's spend, current streak, or
their top-room rank. Notifications are confined to web push (which is
flaky on iOS and absent for users without a browser tab open).

**Goal.** A native menu-bar / tray app on macOS + Windows that shows
today's spend, current streak, and top-room rank at a glance, fires
native OS notifications on "you got passed" + "room hit a milestone",
and links out to the web for deeper views.

**Locked design decisions (already made during sharpening):**

- **Auth.** Same flow as the CLI: device-code via `/cli?code=XXXX`.
  Token stored in the OS keychain (Keychain on macOS, Credential
  Manager on Windows). Optimization: if the local CLI token file
  already exists (`~/.token-rats/token.json` or wherever the CLI stores
  it), the taskbar imports it on first launch and skips the device-code
  flow. Falls back to device-code for fresh installs.
- **Sync model.** Pull-only. Taskbar polls a new thin endpoint
  `/v1/me/taskbar` every 60s while the app is open. The endpoint
  returns today's tokens + cost, current streak, top-room rank,
  last-sync timestamp, plus a pending-notifications array (for the
  events below). No CLI invocation from the taskbar — "sync now"
  either opens a terminal with the CLI command or punts the action
  entirely (decide at build time).
- **Notifications.** Two events for v1: "you got passed" (your rank in
  any room you're in dropped vs last seen) and "your room hit a
  milestone" (room crosses 1M / 10M / 100M / 1B token thresholds).
  Computed server-side and returned in the taskbar summary payload;
  the taskbar dispatches them to the native notification system.
- **Distribution.** Brew tap for macOS (`brew install
  token-rats/tap/token-rats-taskbar`) and winget for Windows.
  Code-signing for v1: TBD when we revisit — picking unsigned keeps
  costs at zero but adds Gatekeeper / SmartScreen friction; macOS
  signing ($99/yr Apple Developer ID) is probably worth it on the
  priority platform.
- **Workspace.** New `apps/taskbar` workspace. Rust + Tauri 2.x. New
  CI matrix: `macos-14`, `windows-2022`. No contract changes — only
  the new `/v1/me/taskbar` endpoint.

**Why deferred.** The user wants to open-source the repo first.
Building a Tauri app in a closed repo creates a release artifact people
can't audit; doing it after open-sourcing means the install / build
flow can be public from day one. Also a ~2-week task on its own — best
to land after the smaller features that the user wants in front of the
audience.
