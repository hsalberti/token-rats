# Token Rats — Roadmap

> **Pending only.** As features ship to `main`, they move out of this file into the public `/changelog` page (the `PATCHES` array in `apps/web/app/changelog/page.tsx`). The historical snapshots in `apps/web/app/changelog/_archive/` are frozen phase records — we don't add to that folder in normal flow.
>
> Long-lived parking lot for big deferred items lives in [`roadmap-deferred.md`](./roadmap-deferred.md). Explicitly-deferred-for-now items are at the bottom of this file.

## Legend

- 🟩 **Parallel** — independent of other items here; can ship alongside any other 🟩 feature.
- 🟦 **Sequential** — depends on another feature in this file shipping first; ship order matters.
- 🟨 **Convergence** — depends on multiple parallel features landing; ships last.

## Features

### 🟩 Group heatmap + room summary + group streak (30d default)

Visit `/r/<code>` and see a stat strip + 30-day group heatmap + active-streak pill above the leaderboard. `/u/<handle>` heatmap also defaults to 30 days with a `52w` toggle that swaps the data live. The room OG card renders stat strip + streak pill (no heatmap — too busy at 1200×630).

**Touches:** new contract types (`RoomSummary`, `GroupStreak`; existing `Heatmap` gains a `range` field); new endpoints `GET /v1/r/:code/heatmap`, `GET /v1/r/:code/summary`, `GET /v1/r/:code/group-streak`; extend existing `GET /v1/u/:handle/heatmap` with `?range=30d|52w` (default `30d`); parameterize `<ProfileHeatmap>` (today hard-coded 53×7 / 364d) into a reusable `<Heatmap range>`; updates to `/r/<code>` and `/u/<handle>` pages and the room OG card under `/cards/room/`.

**Definition of done:**
- Single `<Heatmap range='30d'|'52w' />` component renders both modes; 30d uses a denser layout sized to ~30 days, not the 53×7 grid. Bucket + color logic shared.
- Toggle on `/u/<handle>` and `/r/<code>` swaps data live and keeps `?range=` in sync via shallow nav; default (`30d`) is bare URL.
- Stat strip on `/r/<code>`: three tiles — **Members · 30d tokens · 30d cost**. Tokens is the headline.
- Stat strip is visible to anyone who can reach the page, including signed-out and non-members on a *private* room with the link. Heatmap + streak pill are member-only on private rooms; public rooms (post feature #6) show both to everyone.
- Group streak rule: a day counts toward the streak iff **≥1 room member has a `daily_rollup` row with `tokens > 0` for that UTC day**. The pill shows the current consecutive-day count; breaks on the first all-zero day. Today (in progress) does not count yet.
- Room OG card route (`/cards/room/<code>`) renders stat strip + streak pill. Heatmap omitted by design.
- No KV cache in this round — queries hit D1 directly. Revisit only if a room page exceeds the latency budget.

**Order constraints:** the `Heatmap` contract gains `range`; existing profile-heatmap consumer (`/u/<handle>`) must migrate in the same PR. No migrations.

**[OPEN]** Stat-strip-on-private-rooms leaks "this room exists and has N members + $X spent" to anyone with the link. This is a real change to private-room semantics (today everything 403s). Confirm before merge.

---

### 🟩 `/trending` as the signed-out homepage

Signed-out visitors land on a live global leaderboard with today/7d/30d tabs (default `7d`). A slim hero strip sits above the board. The current "How it works" and "We literally can't read your prompts" sections move *below* the board. The sample-leaderboard section is deleted (the real one is right there). Signed-in users still redirect to `/app`.

**Touches:** `apps/web/app/page.tsx` (rebuild around `<TrendingClient initialRange="7d" />`); `apps/web/app/trending/page.tsx` becomes a 301 redirect to `/`; OG meta on `/` switches from marketing framing to live-board framing; preserve `?ref=<code>` forwarding to the sign-in CTA (existing `pickRef()` regex stays); update any internal links pointing to `/trending`.

**Definition of done:**
- `/` signed-out: SSR's the live board at 7d, hero strip above, How-it-works + privacy strip below, footer unchanged. No mock data anywhere.
- `/` signed-in: `redirect("/app")` (unchanged).
- `/trending` returns **301 to `/`** for all viewers. Share-card routes under `/cards/trending/...` continue to render unchanged.
- Range tab switching keeps `?range=` in sync via shallow nav; bare `/` defaults to 7d.
- `?ref=<code>` still flows through to the GitHub OAuth start URL in the new hero CTA.
- `/` OG meta reflects the live-board content, not the marketing pitch (preview shows "today's top burners" framing).

**[OPEN]** Hero strip contents — pick before implementation:
  (a) wordmark + tagline + install snippet + GitHub sign-in *(recommended — install snippet is the meme; keep it visible above the board)*,
  (b) wordmark + tagline + GitHub sign-in only,
  (c) keep all current landing sections, just *add* board above them.

---

### 🟩 Soft-create org waitlist + student-org tier

Clicking "Create org" inserts a row in `orgs` with `status='pending'`, reserving the slug. Founder lands on `/o/<slug>/pending` showing a plain confirmation ("You're on the waitlist") plus an editable form to provide an **org name** and a **founder email** (both required, trust-on-submit, no verification email). Admin opens `/admin` and sees a searchable list of pending orgs; clicking approve flips `status='approved'`. Student-tier orgs are fully usable post-approval; pro-tier approval is the same flip (Stripe checkout email is **deferred**). No reject path — unapproved orgs simply stay pending.

**Touches:**
- New migration `0009_orgs_pending.sql`: add `orgs.status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved'))`, `orgs.requested_plan TEXT CHECK (requested_plan IN ('free','student','pro'))`, `orgs.founder_email TEXT`, `orgs.founder_name TEXT`, `orgs.approved_by TEXT`, `orgs.approved_at INTEGER`. Expand the existing `orgs.plan` CHECK to include `'student'` (table-rebuild migration — D1 doesn't support `ALTER ... DROP CONSTRAINT`).
- `POST /v1/orgs`: switch to soft-create. Body now accepts `founderEmail` (required), `founderName` (optional), `requestedPlan` ∈ `free | student | pro` (required, replaces the implicit `'free'`). Reject with 409 if the calling user already has a pending or approved org (1-per-user hard cap).
- Member-only routes (`GET /v1/orgs/:slug`, `/dashboard`, `/invites`, `/accept`) start returning 403 when `status='pending'`, except the founder, who can still fetch their own pending org for the form.
- New page `apps/web/app/o/[slug]/pending/page.tsx` — confirmation message + form (name + email). Approved orgs redirect to `/o/<slug>`.
- New admin endpoint `GET /v1/admin/orgs/pending?q=<search>` — searchable by name / slug / email.
- New admin endpoint `POST /v1/admin/orgs/:slug/approve` — flips status, records `approved_by` + `approved_at`. No Stripe call.
- Extend `/admin` page with a "Pending orgs" panel: search box + list + per-row Approve button.
- `roadmap-deferred.md` grows an entry: **Pro-tier org Stripe checkout email on approval** (deferred until billing ships).

**Definition of done:**
- Soft-create returns 201 with the pending org row; slug is uniquely reserved via the existing `idx_orgs_slug`.
- `/o/<slug>/pending` resolves for the founder only when `status='pending'`; renders confirmation + editable name/email form. Other viewers get 403.
- A second `POST /v1/orgs` from the same user returns 409 with a clear error referencing the existing pending slug.
- Existing `orgs.plan` rows continue to validate (`free` / `pro`). New rows can also be `student`.
- Approving a pending org of any tier unblocks all member-only routes for that org. Student-tier approval does not touch Stripe; pro-tier approval also does not touch Stripe in this round.
- Admin search matches partial name / slug / email and returns up to 100 rows.

**Order constraints:**
- The plan-CHECK widening must run before any soft-create writes `requested_plan='student'`.
- No dependency on feature #4 (Resend) — emails are trust-on-submit.
- No new contract package additions beyond extending `CreateOrgRequest` and adding the two admin shapes.

**[OPEN]** Whether the founder can change the **slug** on `/o/<slug>/pending` after submission, or only the name + email. Slug edit re-runs the uniqueness check and re-routes the page. Default: **slug is fixed on submit**, only name + email are editable. Confirm or override.

---

### 🟩 Email capture (no automated sending yet)

Capture each signed-in user's primary verified GitHub email into `users.email` so we have a contact list. Existing users go through a one-time re-auth interstitial on next page load to grant the new `user:email` scope. New users grant it on first login. Email is shown on `/settings` (read-only). **No automated email sending in this round** — Resend wiring, the weekly digest cron, and the unsubscribe flow all defer to [`roadmap-deferred.md`](./roadmap-deferred.md). I'll send any outreach manually from the captured list.

**Touches:**
- New migration `0010_users_email.sql`: `ALTER TABLE users ADD COLUMN email TEXT`. Nullable — some GitHub users have no primary verified email.
- Bump GitHub OAuth scope from `read:user` to `read:user user:email` in `apps/api/src/routes/auth.ts:66` (and any other OAuth start URL builder).
- On OAuth callback: call `GET https://api.github.com/user/emails`, pick the entry where `{ primary: true, verified: true }`. Upsert that into `users.email` on **every** login (so users who add a verified email later get updated). If none qualify, leave `users.email = NULL`.
- Add a one-time re-auth interstitial: on any authed request from a user whose session-token's scope set doesn't include `user:email` (or, simpler, whose `users.email IS NULL` AND they signed up before the scope-bump deploy date), redirect to GitHub OAuth start once. Don't trap them in a loop if they decline.
- Show the captured email on `/settings` as a read-only row ("Connected via GitHub"). If `NULL`, show a banner pointing the user to add a primary verified email on GitHub and re-sign in.
- Leave `apps/api/src/lib/email.ts` and `apps/api/src/scheduled.ts` as they are (stub + no-op) with a comment pointing at the deferred entry.

**Definition of done:**
- New users land with `users.email` populated (or `NULL` + banner).
- Existing users hit the one-time re-auth interstitial on next visit; after re-auth their `users.email` is populated. The interstitial does not re-fire after a successful re-auth or after a decline.
- `/settings` shows the captured email read-only; no edit affordance.
- `users.email` is never sent anywhere over the wire from the Worker in this round.
- No changes to `email.ts`, `digest.ts`, `scheduled.ts`, the cron, or `/settings/notifications`.

**Order constraints:**
- The OAuth scope change deploys before the interstitial ships, so the first re-auth picks up the new scope correctly.
- Feature #3 (org soft-create) collects its own `founder_email` independently — this feature does *not* backfill org founder emails from `users.email`.
- No contract changes beyond extending `me` / `User` responses to include `email`.

---

### 🟩 Twitter/X handle pill (frontend wiring)

Backend OAuth + migration already shipped (`auth-twitter.ts`, `0008_users_twitter.sql`). Outstanding work: replace the manual text input on `/settings/profile` with a "Connect X" OAuth button (verified-only), add a "Disconnect X" button, render `<TwitterHandlePill>` on the three pages where it isn't yet (profile, room member list, friends), and configure the OAuth secrets. **Leaderboard rows and OG cards stay handle-only this round** — coverage will be widened in a follow-up if the social loop justifies it.

**Touches:**
- `apps/web/app/settings/profile/Client.tsx`: delete the manual text input + handle-trim onChange; add a single "Connect X" button that hits `GET /v1/auth/twitter/start` and a "Disconnect X" button (calls a new `POST /v1/auth/twitter/disconnect`) shown only when `twitter_handle IS NOT NULL`.
- New endpoint `POST /v1/auth/twitter/disconnect`: nulls `users.twitter_handle` and `users.twitter_oauth_id` for the authed user. No body.
- Backend response wiring: ensure `twitterHandle` is selected and returned on **`/v1/rooms/:code`** (member list) and the friends endpoint already returning it (no change needed). Profile response already includes it.
- Frontend render wiring: replace the inline `<a>` markup in `apps/web/app/u/[handle]/page.tsx:153` with `<TwitterHandlePill handle={profile.twitterHandle} />`; replace the inline `𝕏 @...` link in `apps/web/app/app/friends/FriendsClient.tsx:121` with the same component; add the pill to the room member list in `apps/web/app/r/[code]/RoomView.tsx`.
- Secrets: `wrangler secret put X_OAUTH_CLIENT_ID` and `X_OAUTH_CLIENT_SECRET` for both `development` and `production` environments before merge.

**Definition of done:**
- "Connect X" → GitHub-style OAuth round-trip → `users.twitter_handle` populated → button flips to "Disconnect X" and the handle renders read-only beside.
- "Disconnect X" → server clears both columns → pill disappears on every render site within one navigation.
- Profile page, room member list, and friends list all use the shared `<TwitterHandlePill>` (no inline markup duplicates).
- Re-connecting overwrites `twitter_handle` (handles X-side renames automatically).
- Manual handle input is removed entirely from the codebase; the only way to set a handle is OAuth.
- Settings page does not display a stale handle from the input's prior state after disconnect.

**Order constraints:**
- The secrets must be set before the OAuth button ships, or the redirect 500s.
- No contract changes for leaderboard/trending (deferred by scope). Only the room contract may need to add `twitterHandle` to its member-row shape if it's missing today.

**[OPEN]** Pre-existing manually-set handles (users who set a value in the now-removed text field): leave as-is, or clear in a one-time backfill migration? My recommendation: **leave them**. Add a banner on `/settings/profile` saying "Your handle was set manually before we required OAuth — reconnect to mark it verified." Compromise: leave the data, but only render the pill on render sites if a separate `twitter_verified` boolean is true (requires migration `0011_users_twitter_verified.sql`). Confirm preference.

---

### 🟩 Public country-locked groups

A new `/groups` page lists public rooms in the viewer's `cf-ipcountry` (signed-out viewers see a teaser version of the same list — sign-in required to actually join). Creating a public room locks `rooms.country` to the **creator's** `cf-ipcountry` (no dropdown, no override). Joining a public room requires `cf-ipcountry` to equal the room's country at join time; once joined, no re-check (travel + VPN flips don't kick members out). Country-mismatch viewers of `/r/<code>` see the full read-only content with the join button replaced by a "For viewers in 🇩🇪 Germany" pill. VPN spoofing on the join request is acceptable — we're not building citizenship verification.

**Touches:**
- New migration `0011_rooms_public.sql` (number depends on whether org-pending lands first): `ALTER TABLE rooms ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0; ALTER TABLE rooms ADD COLUMN country TEXT;` plus a partial index `CREATE INDEX idx_rooms_public_country ON rooms(country) WHERE is_public = 1;` to keep `/groups` cheap.
- `POST /v1/rooms`: body grows `isPublic: boolean` (default `false`). When `isPublic=true`, read `cf-ipcountry` from the request and store it as `rooms.country`. If the header is missing or `"XX"` (Cloudflare unknown), return 400 with a clear error.
- `POST /v1/rooms/:code/join`: when the target room has `is_public=1`, compare `cf-ipcountry` to `rooms.country`. Mismatch → 403 with `{ error: "country_mismatch", expected: "DE" }`. Private rooms (`is_public=0`) bypass the check entirely (current behavior unchanged).
- `GET /v1/rooms/:code`: continues to render full content for everyone for public rooms (no auth or country gating). The web client renders the join CTA conditionally based on the user's `cf-ipcountry`.
- New endpoint `GET /v1/groups` (auth optional): reads `cf-ipcountry` from the request, returns up to 50 public rooms where `country = <header>` plus `{ memberCount, total30dTokens, total30dCost }` per row. Sorted by `total30dCost DESC`. Empty `cf-ipcountry` → returns empty list.
- New page `apps/web/app/groups/page.tsx`: server-renders the list; signed-out → join button replaced with "Sign in to join". Header copy localizes the country name + flag via `Intl.DisplayNames`.
- Room-create form: add an `<input type="checkbox">` "Make this a public room for <country>" — the country shown is `cf-ipcountry`, read-only. Unchecked → existing private-room flow.
- `/r/<code>`: when `room.is_public=true` AND `viewer.cf-ipcountry !== room.country`, replace the join button with a non-interactive pill "For viewers in <FLAG> <country>". Stat strip + heatmap + leaderboard stay visible (feature #1 already covers public-room visibility).

**Definition of done:**
- Creating a public room with no `cf-ipcountry` returns 400. With a valid header → room is created with `is_public=1, country='<header>'`.
- The room-create form does not let the user choose a country; the displayed country is the inferred one from their request.
- A user with `cf-ipcountry=US` cannot join a public room where `country='DE'` — POST returns 403, web shows the country pill.
- A user already in a public room continues to access it after their `cf-ipcountry` changes (e.g. on travel) — no kick, no re-check.
- `/groups` signed-in: full list with working join buttons. `/groups` signed-out: same list, join buttons swap to "Sign in to join" CTAs preserving `?next=<path>`.
- Empty country (`""` or `"XX"`) → `/groups` returns empty list and the page renders a clear "we couldn't detect your country" message.
- Private rooms behave exactly as today.

**Order constraints:**
- Feature #1 (stat strip + heatmap) already references public rooms in its visibility rules — neither feature blocks the other, but they should ship within a release of each other so the public-room visibility story is testable end-to-end.
- The migration number depends on whether feature #3's `0009_orgs_pending.sql` and feature #4's `0010_users_email.sql` land first. Coordinate before merge so we don't reuse numbers.

**[OPEN]** What's the v1 cap on **public rooms per user**? Suggestion: 3 public rooms per owner per country, to discourage spam. Confirm or override.

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

- **Heatmap default is 30 days** everywhere (personal and group), with a `52w` toggle on both `/u/[handle]` and `/r/[code]`. The friend wave is recent — long-range views obscure the signal.
- **Group heatmap on `/r/[code]` is the headline feature** — ship room summary + group streak alongside it.
- **`/trending` is promoted to the signed-out homepage `/`**. The current landing copy folds into a slim top section above the live board.
- **Org creation looks real even though orgs are paused.** A soft-create flow stores the org as `status='pending'`, captures the slug + founder, and shows a "pending approval" page. We don't hide demand, we measure it.
- **Student orgs get free org creation** — admin-approved through the same soft-create queue. They're the test cohort for the eventual paid plan.
- **Friends are derived, not requested.** Anyone you share a private (non-public) room with is a friend. No friend graph table.
- **Twitter/X is real OAuth** — verified handle stored on the user, rendered as a pill next to display name on profile, room member list, and friends list this round (leaderboard + OG cards deferred). Read-only scope; auto-post stays deferred.
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
