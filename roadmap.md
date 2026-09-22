# Current direction

Enterprise work is paused. The [open source release plan](docs/open-source-release.md) takes priority over the historical tracks below.

# Token Rats — Roadmap v1.2

> **Created: 2026-05-19.** Sister doc to `apps/web/app/changelog/_archive/v1.0-launch-build.md` (shipped) and `apps/web/app/changelog/_archive/v1.1-sharpen-the-edge.md` (closed; partial ship, see header). The provider-expansion sub-effort lives in `notes/provider-expansion.md`.

## Frame (read before picking up a track)

v1 (Phases 0–3) shipped. v1.1 closed with the personal heatmap landed and Track P (head-to-head 1v1 cards) dropped. The product is gaining traction inside a private friend wave, so v1.2 optimizes for two things:

1. **Ride the wave** — drop visible group surfaces and front-door promotion *this week*, while attention is here.
2. **Capture what we can't ship yet** — student orgs, public country groups, friend-of-friend chains, and a taskbar app are real demand signals but too heavy to ship together. A *soft-create* surface turns "I want this" into a captured contact instead of a bounce.

Same legend as v1.0 / v1.1:
- 🟦 **Sequential** — must finish before the next thing.
- 🟩 **Parallel** — fan-out friendly; one agent per track.
- 🟨 **Convergence** `— short serial merge.

Track letters continue from v1.1 (P is dropped; we resume at **Y**).

### Locked product decisions

These came out of the v1.2 planning session. They override anything inferred from prior roadmaps.

- **Heatmap default is 30 days everywhere** (personal and group), with a `52w`, '36w' toggle on both `/u/[handle]` and `/r/[code]`. The friend wave is recent — long-range views obscure the signal.
- **Group heatmap on `/r/[code]` is the headline feature** — ship the rest of v1.1 Track V (room summary + group streak) alongside it.
- **`/trending` is promoted to the signed-out homepage `/`**. The current landing copy folds into a slim top section above the live board.
- **Org creation looks real even though orgs are paused.** A soft-create flow stores the org as `status='pending'`, captures the slug + founder, and shows a "pending approval" page. Replaces v1.1 Track Q ("bury the org plan") — we don't hide demand, we measure it.
- **Student orgs (`estudantis`) get free org creation** — admin-approved through the same soft-create queue. They are the test cohort for the eventual paid plan.
- **Friends are derived, not requested.** Anyone you share a private (non-public) room with is a friend. No friend graph table. A `/app/friends` view aggregates them.
- **Twitter/X is real OAuth** — verified handle stored on the user, rendered as a pill next to display name everywhere a handle appears. Read-only scope; auto-post stays deferred.
- **Public groups are country-locked via `cf-ipcountry`** — visible *and* joinable only to viewers whose Cloudflare-resolved country matches. VPN spoofing is acceptable; we're not building citizenship verification.
- **Taskbar app is cross-platform (macOS + Windows tray) via Tauri 2.x.** New workspace `apps/taskbar`. Reuses existing API; no contract changes.

### Carry-over from v1.1

- ✅ Track V (personal heatmap) — shipped at 364d; we re-default to 60d in Track Y below.
- 🔁 Track R (Web Push payload encryption) → v1.2 Track AG.
- 🔁 Track S (email column + Resend) → v1.2 Track AB.
- 🔁 Track T (Playwright smokes) → v1.2 Track AI; expanded scope to cover new v1.2 surfaces.
- 🔁 Track U (primary-source pill) → v1.2 Track AF.
- 🔁 Track V remainder (room summary + group streak + room heatmap) → v1.2 Track Y.
- 🔁 Track X (waitlists) → folded into v1.2 Track AA (org soft-create reuses the same `waitlists` table for the `provider:*` topics).
- ❌ Track P (1v1 cards) — dropped, not replaced.
- ❌ Track Q (bury org plan) — superseded by AA. We capture intent, we don't hide the surface.

---

## Phase 5a — Ride the wave (🟩 4 parallel tracks, ~3–5 days)

Goal: four visible new surfaces inside a week, while the friend wave is hot. All four are independent on contracts and DB after their initial migration land.

### 🟩 Track Y — Group heatmap + room summary + group streak (60d default)

**Owner:** Agent Y (supervise personally — this is the v1.2 wedge)
**Inputs:** `daily_rollup`, shipped `<ProfileHeatmap />`, existing `streaks.ts` day-walker
**Outputs:** three endpoints, stat strip on `/r/[code]`, generalized heatmap with 60d/52w toggle

- New contract types in `packages/contracts`: `RoomSummary`, `HeatmapResponse`, `GroupStreak`.
- New endpoint `GET /v1/heatmap?scope=user|room&id=<handle|code>&days=60|364` → `{ range, cells: [{ date, costUsd, tokens, level: 0|1|2|3|4 }] }`. Levels re-binned per-range (quartiles of non-zero days for that scope). Default `days=60`.
- New endpoint `GET /v1/rooms/:code/summary?range=today|7d|30d|all` → `{ totalCostUsd, totalTokens, activeMembers, dayCount, topContributorSharePct, modelMix[], sourceMix[] }`. Member-gated (404 to non-members). Same KV cache key family as leaderboard, same invalidation on ingest.
- New endpoint `GET /v1/rooms/:code/group-streak` → `{ activeStreakDays, longestStreakDays, unanimousActiveStreakDays, unanimousLongestStreakDays }`. Definitions per v1.1 V.C: **active** = ≥1 member has a row; **unanimous** = every *current* member has a row. New members joining mid-streak don't retroactively break unanimous — only count days from their latest join.
- Update existing `GET /v1/u/:handle/heatmap` to honor `?days=60|364`, default 60. Re-bin levels.
- Single reusable `<Heatmap />` component (extracted from `<ProfileHeatmap />`). Used on `/u/[handle]`, `/r/[code]`, and the OG card variants `/cards/u/[handle]` and `/cards/room/[code]`. Add a small `60d ⇄ 52w` toggle on both web pages; OG cards always render at the active default (60d).
- Render a stat strip above the room leaderboard on `/r/[code]` (uses `RoomSummary`). Same range selector as the leaderboard — single source of truth for the active range.
- Render a `🔥 14d` pill at the top of the stat strip for the active group streak; unanimous count in the hover/title.

**Definition of done:** `/r/[code]` for a room with ≥7 days of history shows stat strip + heatmap + non-zero active streak pill. `/u/[handle]` heatmap defaults to 60d with a 52w toggle that actually swaps the data. All three endpoints return <100ms cached, <500ms cold. A heavy room and a brand-new room render visibly different heatmaps.

---

### 🟩 Track Z — Promote `/trending` as the signed-out homepage

**Owner:** Agent Z
**Inputs:** existing `/trending` route (KV-cached, public-only, banlist-filtered), existing landing page at `/`
**Outputs:** homepage *is* the global leaderboard for signed-out visitors

- Move the current landing copy (one-liner + `npx token-rats` install + "Sign in with GitHub") into a slim top section above a live trending table.
- Signed-in users still get the authed dashboard at `/app` — no change.
- Keep `/trending` reachable as a deep-link target; either 301 to `/` or render the same component, pick one and document in the PR.
- Update OG meta on `/` so social shares show the live global card from `/cards/trending/[range]`.
- Add "your room could be here" footer CTA on every leaderboard row that 404s a non-member but ?invite-wraps the URL for signed-out clicks.
- No contract or DB changes.

**Definition of done:** Signed-out `tokenrats.com/` renders the live global board with today/7d/30d tabs and a sticky sign-in CTA. The page survives a `pnpm build` + Lighthouse mobile audit with a perf score ≥85.

---

### 🟩 Track AA — Soft-create org waitlist + student-org tier

**Owner:** Agent AA
**Inputs:** existing `/o/new` page, existing `orgs` table + routes (Phase 3), new `waitlists` table from v1.1 Track X
**Outputs:** the growth-hack surface — org creation that *looks* real, captures the intent, and queues for admin approval

- Migration `0007_orgs_pending.sql`: add `orgs.status TEXT NOT NULL DEFAULT 'active'` (existing rows = `'active'`); add `orgs.plan TEXT NOT NULL DEFAULT 'team'` with values `'team' | 'student' | 'enterprise'`. Index `(status, created_at)`.
- Migration `0008_waitlists.sql` (carry from v1.1 X): `waitlists(id, topic, email, github_login, payload_json, created_at, INDEX(topic, created_at))`. Topics: `'orgs'`, `'provider:<id>'`, `'provider:other'`.
- `POST /v1/orgs` change: when the caller is not yet allowed to create an active org (default for everyone until we decide otherwise), create the row with `status='pending'`, also insert a `waitlists` row with `topic='orgs'` + the org slug + claimed plan tier (`student` if the form's student-checkbox is on). Returns `{ ok: true, status: 'pending', orgSlug, position }`.
- New page `/o/[slug]/pending` — the founder lands here after submit. Reads as: "Your org **<name>** is reserved. You're #<N> on the waitlist. We'll approve in a few days." Edit-application form lets them change the slug, plan tier, and a free-text "why us" note. Visible only to the founder and admins; everyone else gets 404.
- `/o/new` form gains a checkbox: "I'm creating this for a university / student group (free)". Toggling it sets `plan='student'` on submission and adds a `university` field to the payload.
- New admin endpoint `POST /v1/admin/orgs/:slug/approve` (gated by the existing admin-user check, same one `/admin/abuse` uses): flips `status='pending' → 'active'`, no other side effect. Optionally `?plan=student` to lock in the student tier (skips Stripe).
- New admin endpoint `GET /v1/admin/orgs/pending` returns the queue newest-first, paginated.
- **Replaces v1.1 Track Q ("bury org plan").** Public navigation to `/o/new` stays visible — we now want the click, not the silence.

**Definition of done:** A signed-in user fills "Create org", clicks submit, lands on `/o/<slug>/pending` showing their name as founder and their queue position. Re-submitting with the same slug returns the existing pending state, not a duplicate. Admin can approve via `POST /v1/admin/orgs/:slug/approve`, after which the founder's next page load on `/o/<slug>` goes to the real org dashboard. Approving with `plan=student` means Stripe webhook events for that org are ignored / no-op.

**Note on the "trick":** the UX you described — button says "Create org", reveals waitlist after — is honored in spirit: the form *does* create an org row, with the slug reserved and the founder set. The only difference from a normal org is `status='pending'` and that the dashboard is gated. So the user isn't deceived; they really did create something. They just can't use it until approved. This is the "soft-create" path; cleaner than a pure bait-switch and the captured data is identical.

---

### 🟩 Track AB — Email column + Resend (Track S, unchanged)

**Owner:** Agent AB
**Inputs:** `users` table (no `email` column), `apps/api/src/lib/email.ts` (still a console-log stub per audit), GitHub OAuth callback
**Outputs:** users have emails, weekly digest cron actually delivers

- Migration `0009_users_email.sql`: add `email TEXT` to `users`. No SQL backfill.
- GitHub OAuth callback: bump scope to `read:user user:email`, fetch primary verified email on every login, upsert to `users.email`.
- Replace the stub in `lib/email.ts` with a Resend call using a new Worker secret `EMAIL_PROVIDER_API_KEY`. Plain HTML, ~50 lines, no template library.
- Wire `scheduled.ts` + `lib/digest.ts` to actually call the new helper.
- Add `POST /v1/notifications/unsubscribe?token=<signed>` — sign with the existing session-signing key.
- Add a "weekly digest email" toggle on `/settings/notifications` (the preference column already exists per audit — wire it to the email send).

**Definition of done:** Signed-in user sees their email on `/settings`. `wrangler dev --test-scheduled` delivers a real email through the Resend sandbox. Unsubscribe link works.

---

### 🟨 Phase 5a convergence (~half day)

Merge order: AA migrations → Y contract types → AB migration → Z (frontend only, last). Smoke acceptance — one human walks this on a fresh machine:

1. Sign out, land on `/`, see live global leaderboard.
2. Sign in. See `/app` dashboard.
3. Sync. Open `/r/<code>` — see stat strip, group streak pill, 60d group heatmap.
4. Open `/u/<me>` — see 60d personal heatmap with a 52w toggle that flips the data.
5. Click "Create org" from anywhere. Fill the form. Land on `/o/<slug>/pending`.
6. Trigger `wrangler dev --test-scheduled` — receive a real Monday-digest email in Resend's sandbox.

**Phase 5a done when:** all four DoDs are met and the convergence smoke is clean.

---

## Phase 5b — Connect (🟩 5 parallel tracks, ~1–2 weeks)

Once 5a is live, widen the funnel. All five are independent on each other.

### 🟩 Track AC — Twitter/X OAuth on profile

**Owner:** Agent AC
**Inputs:** GitHub OAuth helper as a reference, `users` table
**Outputs:** verified Twitter handle stored + rendered everywhere a handle appears

- Migration `0010_users_twitter.sql`: add `users.twitter_user_id TEXT`, `users.twitter_handle TEXT`, `users.twitter_verified_at INTEGER`. Index `(twitter_user_id)`.
- New Worker secrets: `X_OAUTH_CLIENT_ID`, `X_OAUTH_CLIENT_SECRET`. Use OAuth 2.0 with PKCE; `users.read tweet.read` scope only (free tier — read-only, no posting in v1.2).
- New routes: `GET /v1/auth/twitter/start` (sets PKCE cookie, redirects to X), `GET /v1/auth/twitter/callback` (exchanges code, upserts handle + user_id, sets verified_at).
- `/settings/profile` gains a "Connect Twitter/X" button + disconnect button. Disconnect nulls the three columns.
- Render the handle as a small `@handle` pill next to display name on: leaderboard rows (signed-in side), `/u/[handle]`, room member list, `/app/friends` (Track AD), every OG card route under `/cards/`.

**Why read-only:** auto-posting the weekly recap is a real demand signal but lives behind X's paid tier post-2024. Land verification first, monetize later. The pill alone is the credibility multiplier on share cards.

**Definition of done:** User clicks "Connect Twitter" on `/settings/profile`, completes OAuth, sees their handle on their profile and all surfaces above. Disconnect works. Failed OAuth returns to `/settings/profile?error=twitter` without corrupting state.

**Status (2026-05-19):** Backend shipped on dev — routes mounted at `/v1/auth/twitter/start`, `/v1/auth/twitter/callback`, `/v1/me/twitter/disconnect`. Migration `0008_users_twitter.sql` lands. Env vars `X_OAUTH_CLIENT_ID` / `X_OAUTH_CLIENT_SECRET` declared (optional — endpoints respond 503 when unset). `TwitterHandlePill` component exists. **Outstanding:** wire the "Connect Twitter / X" button into `apps/web/app/settings/profile/Client.tsx`, render the pill on leaderboard rows + `/u/[handle]` + room member list + `/app/friends` + OG cards. Configure the two Worker secrets via `wrangler secret put`.

---

### 🟩 Track AD — Friends-from-shared-rooms view

**Owner:** Agent AD
**Inputs:** existing `room_members` + `users` + `daily_rollup`. **No new schema.**
**Outputs:** a `/app/friends` page that aggregates everyone you share a private room with

- New endpoint `GET /v1/me/friends?range=today|7d|30d|all` → `{ friends: [{ userId, handle, twitterHandle, sharedRooms: [{ code, name }], costUsd, sessions, rankDelta }] }`. Computed via a single JOIN: distinct users where they share at least one room with `is_public = FALSE` (column lands in Track AE; default to "all rooms" until then).
- New `/app/friends` page: sorted by activity in range, with the shared-room count and a "vs me this week" mini-stat. Each row links to the friend's `/u/<handle>` if public, otherwise to the shared room.
- No requests, no invites, no accepts. Friendship is a derived relation.
- Reuses the heatmap + leaderboard contract types — no contract additions if we render in-place.

**Definition of done:** A user in three rooms with five distinct other people sees five rows on `/app/friends`, sorted by 7d cost. Twitter pills (Track AC) render if the friend has connected.

**Depends on:** Track AE for the `is_public` column on rooms (until then, treat all rooms as private). Can ship without AE by hardcoding the filter to "all rooms I'm in"; tighten when AE lands.

---

### 🟩 Track AE — Public country-locked groups

**Owner:** Agent AE
**Inputs:** `rooms` table, Cloudflare's `cf-ipcountry` request header (free, no binding needed)
**Outputs:** discoverable public rooms scoped to a viewer's country

- Migration `0011_rooms_public.sql`: add `rooms.is_public BOOLEAN NOT NULL DEFAULT FALSE`, `rooms.country CHAR(2)` (ISO 3166-1 alpha-2, nullable; required if `is_public=TRUE`). Index `(is_public, country, created_at)`.
- `POST /v1/rooms` accepts new fields `{ isPublic?: boolean, country?: string }`. If `isPublic=true`, `country` is required and must match the creator's `cf-ipcountry` at creation time.
- `POST /v1/rooms/:code/join`: if room is public and the joiner's `cf-ipcountry` ≠ `room.country`, return 403 `{ error: "country_locked", room_country, your_country }`. Otherwise behave as today.
- New endpoint `GET /v1/groups` → returns public rooms with `country = cf-ipcountry`, paginated, sorted by member count. Includes the country code in the response for the UI to display.
- New page `/groups` — lists public rooms in the viewer's country. Shows "Joining as @viewer from <country>" so it's clear *why* the list is what it is. A footer line: "Travelling? You'll see different groups from a different country."
- `PATCH /v1/rooms/:code` (owner-only, exists today): can flip `is_public` only between `false → true` *if* `country` is provided and matches the owner's current `cf-ipcountry`. Cannot flip `true → false` if there are non-country members already (preserve invariant). Owners can null `country` only by deleting / hiding the room.
- No moderation pipeline in v1.2 — leans on the existing abuse helper + admin-banlist. If a public room is reported, admin can flip `is_public=false` via the existing abuse admin route.

**Definition of done:** From an IP geolocating to BR, `/groups` shows only BR public rooms. Joining via `POST` from a US IP returns 403. Creating a public room from BR successfully stores `country='BR'`. From the US, the same `/groups` page shows US-only rooms with no overlap.

---

### 🟩 Track AF — Primary-source pill (Track U from v1.1, unchanged)

[Carry over the full v1.1 U spec — `sourcePlan` field on `SessionRecord`, `primarySource` field on `LeaderboardRow` + `PublicProfile` + `Me`, ≥50% share threshold, kebab-case label vocabulary, render-everywhere rule.]

**Definition of done:** Same as v1.1. Should merge after Y so the room heatmap surface picks up the pill too.

---

### 🟩 Track AG — Web Push payload encryption (Track R from v1.1, unchanged)

[Carry over the full v1.1 R spec — ECDH P-256 + HKDF + AES-128-GCM per RFC 8291 in `apps/api/src/lib/webpush.ts`, unit-test against RFC 8291 vectors, E2E from `/settings/notifications`.]

**Definition of done:** Same as v1.1. Document the iOS Safari limitation; don't chase it.

---

## Phase 5c — Bigger lifts (~2–3 weeks, 2 tracks)

These take real time. Start when 5a is fully merged.

### 🟩 Track AH — Taskbar app (Tauri, macOS + Windows)

**Owner:** Agent AH (longest single track in v1.2; budget two weeks)
**Inputs:** existing `/v1/me`, `/v1/rooms/:code/leaderboard`, SSE live endpoint, existing auth cookie + CLI token
**Outputs:** new workspace `apps/taskbar` shipped to both stores

- Stack: **Tauri 2.x** (Rust core, web UI). Reuses existing React components where possible via a slim web view; native menu bar / tray via Tauri's tray API.
- Surface (v1.2 scope, intentionally narrow):
  - Today's spend ($, tokens).
  - Current personal streak.
  - Top room you're in: your rank + delta since yesterday.
  - "Sync now" action (invokes the same code path as the CLI's `token-rats sync`).
  - Native OS notifications on (a) "you got passed" and (b) "your room hit a milestone".
- Auth: device-code flow, same as the CLI's `/cli?code=XXXX` page. Stores token in the OS keychain (Tauri has bindings for both keychains).
- Auto-launch on login: opt-in toggle in app settings; default off.
- Distribution: brew tap `tokenrats/tap` (Mac), `winget` package (Windows). v1.2 ships unsigned installers behind a warning page; signing comes in v1.3.
- **No contract changes.** Uses existing endpoints.
- New CI job: `taskbar` build matrix (macos-14, windows-2022). Artifacts uploaded but not auto-released.

**Definition of done:** A user can install via brew/winget, complete device-code auth, and see their live spend in the tray. Pushing a session via CLI updates the tray within 5s via SSE. Notifications fire on a simulated "got passed" event.

---

### 🟩 Track AI — Playwright smokes (Track T from v1.1, expanded)

**Owner:** Agent AI
**Inputs:** all v1.2 surfaces
**Outputs:** ~10 Playwright tests in CI, runs in <90s

Update v1.1 T's test list to cover v1.2 surfaces:
1. `/signin` → mock GitHub callback → `/app`.
2. `/` (signed out) renders the trending board with three range tabs.
3. `/r/[code]` renders stat strip + group streak pill + 60d group heatmap with a 52w toggle that swaps data.
4. `/u/[handle]` heatmap defaults to 60d, toggle to 52w works.
5. `/o/new` → fill form → land on `/o/[slug]/pending` with founder name and queue position.
6. `/settings/profile` → "Connect Twitter" button visible; mock OAuth callback writes the handle.
7. `/app/friends` lists users from at least one shared room.
8. `/groups` filters by `cf-ipcountry` (mock the header at the msw layer).
9. OG cards 200 PNG for all variants (room, user, weekly, autobiography, trending, plus the new `60d` heatmap variants).
10. `/settings/notifications` → "send test push" → success toast (after AG ships real encryption).

Run order: stop on first failure. Skip-on-absent for any track that hasn't merged yet (T's original convention).

**Definition of done:** Suite green in CI, runs in <90s, and a deliberately broken card route turns the build red.

---

## Parallelization summary

| Phase | Track | Touches contracts? | Touches DB? | Blocks |
|---|---|---|---|---|
| 5a | Y — Group heatmap + room summary + group streak | **yes** (3 new types + range param) | no | AI (covers new surface) |
| 5a | Z — `/trending` as `/` | no | no | no |
| 5a | AA — Soft-create org + waitlists | no | **yes** (0007 + 0008) | AD (until `is_public` lands), AI |
| 5a | AB — Email column + Resend | no | **yes** (0009) | no |
| 5b | AC — Twitter OAuth | no | **yes** (0010) | AI (pill renders) |
| 5b | AD — Friends view | no | no | depends on AE for `is_public`; can stub |
| 5b | AE — Public country-locked groups | no | **yes** (0011) | AD (unblocks the filter), AI |
| 5b | AF — Primary-source pill | **yes** (one row field + `SessionRecord.sourcePlan`) | no | AI |
| 5b | AG — Web Push encryption | no | no | AI test 10 |
| 5c | AH — Taskbar (Tauri) | no | no | no — entirely new workspace |
| 5c | AI — Playwright | no | no | merges last |

**Merge gate:** Y's contract types (RoomSummary, HeatmapResponse, GroupStreak) and AF's contract additions (primarySource, sourcePlan) must land before AI asserts them. Everything else is independent.

**Effort shape:** roughly one week for 5a with four agents in parallel (you supervise Y). Then 1–2 weeks for 5b with five agents in parallel. Then 2–3 weeks for AH + AI as you have bandwidth.

---

## Prioritization (recommendation, in leverage order)

You said: *ship fast, ride the wave, scale, visibility, especially the org-waitlist growth hack.* My ranking under that lens:

1. **Track Y — group heatmap + 60d default.** Direct value to the friend wave already here. Most visible thing you can ship in 3 days.
2. **Track Z — `/trending` as homepage.** Single biggest visibility lever for strangers. A day of work; quintuples landing-page utility.
3. **Track AA — soft-create org + student tier.** Exactly the growth hack you described. Captures the slug, the founder, the intent, and gives you a queue to manually approve student orgs from. Doubles as v1.1 Track X.
4. **Track AB — email + Resend.** Turns on the engagement loop that's been wired-but-silent since v1.0. Re-engagement compounds over weeks; ship it early.
5. **Track AC — Twitter OAuth.** Verified `@handle` next to leaderboards is the credibility multiplier on every share card. High signal per byte.
6. **Track AD — friends view.** Leans on the wave, no schema work. Cheap social surface that makes returning users feel the network.
7. **Track AE — public country groups.** The org-adjacent surface for non-students. `cf-ipcountry` is genuinely free; signal-to-noise is strong because BR users see BR rooms.
8. **Track AF — primary-source pill.** Small, visual; ride along with the share-card refresh.
9. **Track AG — Web Push encryption.** Necessary infrastructure; not visible. Schedule it but don't gate launch on it.
10. **Track AH — taskbar app.** Biggest "wow" surface, slowest to ship. Two weeks. Start once 5a is live.
11. **Track AI — Playwright.** Last. Asserts the whole stack.

**If you only have time for four tracks this week, ship Y + Z + AA + AB.** That alone hits *ride the wave*, *visibility*, *growth-hack signup*, and *engagement loop* — every theme you named.

---

## Risks specific to v1.2

| Risk | Mitigation |
|---|---|
| 60d default hides long-time users' history | 52w toggle is one click. Cache both ranges in the same KV family — no extra cost. |
| Soft-create users feel deceived ("I thought I was creating an org") | The page says "Your org **<name>** is reserved" — they really did create something. Slug is theirs. Approval is "we just need to flip a switch." Honest framing, captured intent. |
| Country-lock looks broken to users on VPNs / corporate proxies | Show "Joining as @viewer from <country>" prominently so the user knows what country we resolved. Add a "wrong country?" link to a short FAQ. |
| Twitter API costs / rate limits | OAuth read-only is on the free tier as of 2026-Q1. Verify-only flow uses 1 read per login; well inside limits. Defer posting indefinitely. |
| Tauri Windows code-signing rabbit hole | v1.2 ships unsigned with a clear warning. Signing is v1.3. macOS dev-id signing reuses the existing Apple account. |
| Stat strip + heatmap + group streak all on one page = slow first paint | All three endpoints are <500ms cold and KV-cached. Render the stat strip eagerly; lazy-load the heatmap below the fold. |

---

## Explicitly deferred to v1.3+

- **Auto-post weekly recap to X** — needs X paid tier and a posting pipeline. Revisit if Twitter OAuth adoption is high.
- **Friend requests / one-way follows** — derived friendship covers the current wave. Revisit if the friends-of-friends graph becomes a real demand.
- **iOS push** — still known-broken in Safari. Document, don't chase.
- **Reviving the paid org plan publicly** — gated on student-org cohort feedback + D7 retention. Soft-create captures intent in the meantime.
- **Taskbar v2 (linux, native installers, code-signed Windows)** — v1.2 ships brew + winget unsigned. Sign + Linux in v1.3.
- **VS Code extension as a source** — still deferred; Cursor cache covers most of the surface. Provider expansion lives in `notes/provider-expansion.md`.
- **Anti-cheat / verification** — not the bottleneck. Skip until a non-trivial public surface gets gamed.
