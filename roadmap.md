# Token Rats — Roadmap

> **Pending only.** As features ship to `main`, they move out of this file into the public `/changelog` page (the `PATCHES` array in `apps/web/app/changelog/page.tsx`). The historical snapshots in `apps/web/app/changelog/_archive/` are frozen phase records — we don't add to that folder in normal flow.
>
> Long-lived parking lot for big deferred items lives in [`roadmap-deferred.md`](./roadmap-deferred.md). Explicitly-deferred-for-now items are at the bottom of this file.

## Legend

- 🟩 **Parallel** — independent of other items here; can ship alongside any other 🟩 feature.
- 🟦 **Sequential** — depends on another feature in this file shipping first; ship order matters.
- 🟨 **Convergence** — depends on multiple parallel features landing; ships last.

## Features

### 🟩 Group heatmap + room summary + group streak (60d default)

Visit `/r/<code>` and see a stat strip + 60-day group heatmap + active-streak pill above the leaderboard. `/u/<handle>` heatmap also defaults to 60 days with a `52w` toggle that swaps the data live. OG cards render the active default.

**Touches:** new contract types (`RoomSummary`, `HeatmapResponse`, `GroupStreak`); three new API routes (`/v1/heatmap`, `/v1/rooms/:code/summary`, `/v1/rooms/:code/group-streak`); a reusable `<Heatmap>` component extracted from `<ProfileHeatmap>`; updates to `/r/<code>` and `/u/<handle>` pages and the matching OG card routes.

---

### 🟩 `/trending` as the signed-out homepage

Signed-out visitors land on a live global leaderboard with today/7d/30d tabs. The current marketing copy folds into a slim hero above the board. Signed-in users still land on `/app`.

**Touches:** `apps/web/app/page.tsx` (rebuild around `<TrendingClient>`); OG meta on `/`; a decision on whether `/trending` stays as a deep-link target or 301s to `/`.

---

### 🟩 Soft-create org waitlist + student-org tier

Clicking "Create org" creates the org row with `status='pending'`, lands the founder on `/o/<slug>/pending` showing their queue position, and lets them edit the slug / plan tier / pitch. A "student / university" checkbox routes the org to the free tier. Admins approve via a new endpoint; approving with `plan=student` skips Stripe entirely.

**Touches:** two new migrations (`orgs.status` + `orgs.plan`; `waitlists` table); `POST /v1/orgs` change to soft-create; new `/o/<slug>/pending` page; `POST /v1/admin/orgs/:slug/approve`; `GET /v1/admin/orgs/pending` admin queue.

---

### 🟩 Email column + Resend integration

Signed-in users see their email on `/settings`. The Monday weekly digest cron actually delivers email through Resend's sandbox. Unsubscribe link works.

**Touches:** new migration (`users.email`); bump GitHub OAuth scope to `read:user user:email` and upsert email on every login; replace `lib/email.ts` console-log stub with a ~50-line Resend call; wire `scheduled.ts` + `lib/digest.ts`; `POST /v1/notifications/unsubscribe?token=<signed>`; `/settings/notifications` toggle.

---

### 🟩 Twitter/X handle pill (frontend wiring)

Backend OAuth + migration already shipped (`auth-twitter.ts`, `0008_users_twitter.sql`). What's outstanding: wire the "Connect Twitter / X" button on `/settings/profile`, and render the verified `@handle` pill next to display names everywhere.

**Touches:** `apps/web/app/settings/profile/Client.tsx`; render sites — leaderboard rows, `/u/<handle>`, room member list, `/app/friends`, every OG card. Configure `X_OAUTH_CLIENT_ID` + `X_OAUTH_CLIENT_SECRET` via `wrangler secret put`.

---

### 🟩 Public country-locked groups

A new `/groups` page lists public rooms in the viewer's `cf-ipcountry`. Creating or joining a public room is restricted to the matching country. Visible *and* joinable only to viewers whose Cloudflare-resolved country matches. VPN spoofing is acceptable — we're not building citizenship verification.

**Touches:** new migration (`rooms.is_public`, `rooms.country`); `POST /v1/rooms` accepts `isPublic` + `country`; `POST /v1/rooms/:code/join` returns 403 on country mismatch; new `GET /v1/groups` endpoint; new `/groups` page; public-checkbox on the room-create form.

---

### 🟩 Primary-source pill (frontend wiring)

Helpers + component already shipped (`lib/primary-source.ts`, `PrimarySourcePill`). What's outstanding: compute `primarySource` server-side on the relevant responses, and render the pill next to handles everywhere ≥50% of a user's 30d cost came from one source.

**Touches:** server-side compute on `LeaderboardRow`, `PublicProfile`, autobiography stats; render on `/u/<handle>`, room leaderboard, share cards under `/cards/`, trending. Extend `SessionRecord` with `sourcePlan` in parsers.

---

### 🟩 Web Push payload encryption

"Send test push" on `/settings/notifications` actually delivers a notification with a real title + body on Chrome desktop and Android. iOS Safari remains known-broken (document, don't chase).

**Touches:** `apps/api/src/lib/webpush.ts` (ECDH P-256 + HKDF + AES-128-GCM per RFC 8291, using `crypto.subtle` from the Workers runtime); unit tests against RFC 8291 vectors; E2E from `/settings/notifications`.

---

### 🟩 Taskbar app (Tauri 2.x, macOS + Windows)

A native menu-bar / tray app shows today's spend, current streak, top-room rank, and a "sync now" action. Native OS notifications fire on "you got passed" and "your room hit a milestone." Distribution: brew tap (macOS) + winget (Windows), unsigned in this round.

**Touches:** new workspace `apps/taskbar`; Rust + Tauri 2.x stack; device-code auth (same flow as the CLI's `/cli?code=XXXX`); OS keychain storage; new CI build matrix (macos-14, windows-2022). No contract changes — reuses existing endpoints.

This is the longest single feature in the list — budget ~2 weeks. Ship after the smaller features have landed so you're not blocking visible product work on Rust toolchain noise.

---

### 🟨 Playwright smoke suite

Not user-visible; a CI gate. ~10 specs assert the install → first card flow, the new homepage, the heatmap toggle, the soft-create flow, the Twitter connect flow, the friends view, the country-locked groups page, the OG cards, and the test-push toast.

**Touches:** new `apps/web/e2e/`; `@playwright/test` + MSW dependencies; CI workflow change. Runs against a stubbed Worker (msw), not the real one.

**Depends on** every other feature in this list landing first so the specs can assert real surfaces. Ships last.

---

## Locked product decisions

These came out of v1.2 planning and override anything inferred from prior conventions.

- **Heatmap default is 60 days** everywhere (personal and group), with a `52w` toggle on both `/u/[handle]` and `/r/[code]`. The friend wave is recent — long-range views obscure the signal.
- **Group heatmap on `/r/[code]` is the headline feature** — ship room summary + group streak alongside it.
- **`/trending` is promoted to the signed-out homepage `/`**. The current landing copy folds into a slim top section above the live board.
- **Org creation looks real even though orgs are paused.** A soft-create flow stores the org as `status='pending'`, captures the slug + founder, and shows a "pending approval" page. We don't hide demand, we measure it.
- **Student orgs get free org creation** — admin-approved through the same soft-create queue. They're the test cohort for the eventual paid plan.
- **Friends are derived, not requested.** Anyone you share a private (non-public) room with is a friend. No friend graph table.
- **Twitter/X is real OAuth** — verified handle stored on the user, rendered as a pill next to display name everywhere. Read-only scope; auto-post stays deferred.
- **Public groups are country-locked via `cf-ipcountry`** — visible and joinable only to viewers whose Cloudflare-resolved country matches.
- **Taskbar app is cross-platform** (macOS + Windows tray) via Tauri 2.x. New workspace `apps/taskbar`. Reuses existing API; no contract changes.

## Explicitly deferred

Real signals that won't ship in this cycle.

- Auto-post weekly recap to X — needs paid X API tier. Revisit if Twitter OAuth adoption is high.
- Friend requests / one-way follows — derived friendship covers the wave.
- iOS push — still known-broken in Safari. Document, don't chase.
- Reviving the paid org plan publicly — gated on student-org cohort feedback + D7 retention.
- Taskbar v2 — Linux, code-signed Windows. v1 ships unsigned.
- VS Code extension as a source — Cursor cache covers most of the surface. Provider expansion lives in [`notes/provider-expansion.md`](./notes/provider-expansion.md).
- Anti-cheat / verification — not the bottleneck.

---

_Last reviewed: 2026-05-19._
