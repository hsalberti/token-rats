# Token Rats — Roadmap

> **Pending only.** As features ship to `main`, they move out of this file into the public `/changelog` page (the `PATCHES` array in `apps/web/app/changelog/page.tsx`). The historical snapshots in `apps/web/app/changelog/_archive/` are frozen phase records — we don't add to that folder in normal flow.
>
> Long-lived parking lot for big deferred items lives in [`roadmap-deferred.md`](./roadmap-deferred.md). Explicitly-deferred-for-now items are at the bottom of this file.

## Legend

- 🟩 **Parallel** — independent of other items here; can ship alongside any other 🟩 feature.
- 🟦 **Sequential** — depends on another feature in this file shipping first; ship order matters.
- 🟨 **Convergence** — depends on multiple parallel features landing; ships last.

## Features

### 🟩 Global leaderboard preview on `/app`

The signed-in dashboard at `/app` currently shows only "Your rooms" + source picker — the live global leaderboard from `/` is invisible after sign-in. Add a compact preview card that shows **top 10 public users (7d) + the viewer's own row** when their rank is outside top 10. Card links to a "see full board" target. Un-301 `/trending` for signed-in users so that link has a destination (signed-out viewers still get redirected to `/`).

**Touches:**
- `apps/web/app/trending/page.tsx`: branch on `getSession()` — signed-in users render the existing `<TrendingClient>` inside a minimal page shell (header with wordmark + back-to-/app link); signed-out users continue to `permanentRedirect("/")`. SSR fetches `getTrending(range)` for the signed-in path, with `?range=` parsed the same way `/` does it.
- `apps/web/app/app/DashboardClient.tsx`: insert a new `<GlobalBoardPreview />` card between the welcome header and the "Your rooms" section. Component fetches `GET /v1/trending?range=7d` after mount, slices top 10, finds the viewer's row by `userId`, and renders viewer as an 11th highlighted row when `rank > 10`. Top 10 itself is rendered identically whether viewer is public or private.
- `apps/web/components/`: new file `GlobalBoardPreview.tsx` — fully client-side with a skeleton (matches existing rooms-list pattern). Receives `viewerUserId` and `viewerPublicProfile` from props.
- No new endpoint. Reuse `GET /v1/trending`, which already returns `userId` on every row, and read the viewer's id from the `User` object the dashboard already has.

**Definition of done:**
- Signed-in `/app`: a "Global leaderboard · 7d" card sits above "Your rooms", shows top 10 with rank/handle/avatar/tokens/cost. Title links to `/trending`.
- When the viewer's profile is public AND they appear in top 100 with rank > 10, an extra highlighted "You · #N" row renders below the top 10.
- When the viewer's profile is public AND they appear in top 10, no extra row is appended (they're already in the list, highlighted via `userId === viewer.id`).
- When the viewer's profile is private OR they aren't in the top 100, no "You" row renders. A subtle footer link points to `/settings/profile` with copy "Go public to appear on the global board" (only shown when profile is private — verified via `users.public_profile`).
- Signed-in `/trending`: renders the full `<TrendingClient>` with today/7d/30d tabs inside a dashboard-style page shell. Range tabs keep `?range=` in sync via the same shallow-nav as `/`.
- Signed-out `/trending`: still 301s to `/` (unchanged for anonymous viewers).
- `/cards/trending/...` OG routes continue to render unchanged.
- Loading state: skeleton card with 10 placeholder rows, same height as the live state to prevent layout shift.
- Error state: the card renders an inline "Couldn't load global board" line and is dismissible; dashboard does not crash.

**Order constraints:**
- No migration. No contract change beyond a possible `viewerRank: number | null` field if we later decide to compute it server-side — for v1 we compute it client-side from the existing top-100 response, so contracts are untouched.
- Independent of any other feature in this file; ships standalone.

---

### 🟩 Pinned room preview on `/app`

Users can star one room as "pinned"; the dashboard shows a preview card for that room with the **top 5 members (7d) + the viewer's own row if rank > 5**. First room you join is auto-pinned when nothing is pinned; users can change the pin via a star icon on each `RoomCard`. Zero rooms → no card.

**Touches:**
- New migration `0012_room_members_pinned.sql`: `ALTER TABLE room_members ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0;` plus `CREATE UNIQUE INDEX idx_room_members_one_pin_per_user ON room_members(user_id) WHERE is_pinned = 1;` (partial unique index — at most one pinned room per user).
- New endpoint `POST /v1/rooms/:code/pin` (auth + membership required): in a transaction, set `is_pinned = 0` on all the caller's `room_members` rows, then `is_pinned = 1` on the row for this room. Returns 204.
- New endpoint `DELETE /v1/rooms/:code/pin` (auth + membership required): clears `is_pinned` for the caller's row in this room. Returns 204. (Useful if a user wants no pin while having multiple rooms.)
- Auto-pin on first join: in `POST /v1/rooms` and `POST /v1/rooms/:code/join`, after inserting the `room_members` row, run an `UPDATE` that only flips `is_pinned = 1` when the caller has no other pinned row. Same logic applied identically in both create + join paths.
- Auto-rotate on leave: when a user leaves their pinned room (or it's deleted), pick the most-recently-joined remaining `room_members` row and set `is_pinned = 1` on it. If no rooms remain, no pin.
- Extend `GET /v1/me/rooms` response: each room gains `isPinned: boolean`. Update `packages/contracts/src/rooms.ts` (or wherever `Room` is defined) accordingly. Existing consumers tolerate the additional field.
- `apps/web/app/app/DashboardClient.tsx`: insert a `<PinnedRoomPreview />` card between the global-board preview and the "Your rooms" section. Component receives the pinned room (or null) from the `getMyRooms()` response, fetches `GET /v1/rooms/:code/leaderboard?range=7d`, renders top 5 + viewer row when rank > 5. Card title is the room name and links to `/r/<code>`.
- `apps/web/app/app/DashboardClient.tsx` (RoomCard): add a star icon button in the top-right of each `RoomCard`. Filled star when `isPinned`, outline otherwise. Clicking toggles via the new pin/unpin endpoints; optimistic UI with revert-on-error. Pinning a room un-pins all others client-side immediately.
- New `apps/web/lib/api.ts` helpers: `pinRoom(code, cookieHeader)`, `unpinRoom(code, cookieHeader)`.

**Definition of done:**
- New users with one room: that room is auto-pinned; the preview card shows top 5 (7d) and the user's row appears at rank 1 (or wherever) in the top 5 — no separate "You" row needed.
- Users with multiple rooms can switch the pin via the star icon; previous pin is cleared in the same write. Partial unique index enforces single pin.
- A user who leaves their pinned room sees the pin migrate to another room (most-recently-joined) within the same request that processed the leave. If no rooms remain, the preview card vanishes on next render.
- Zero rooms → no pinned-room card renders at all (no empty state for it — the existing "No rooms yet" tile carries the empty state).
- Pinned room of a user whose viewer rank in that room is > 5 → top 5 + appended highlighted "You · #N" row.
- Pinned room where the viewer is in top 5 → 5 rows total; viewer's row is visually highlighted via `userId === viewer.id`.
- The pin endpoints reject non-members with 403 and unknown room codes with 404 (mirrors `/v1/rooms/:code/leaderboard`).
- Loading state: skeleton card with 5 placeholder rows; height matches the live state.
- Error state: inline "Couldn't load pinned room" message; dashboard does not crash.
- Migration applies cleanly with `pnpm db:migrate:local` on a fresh checkout and does not break existing reads of `room_members`.

**Order constraints:**
- Migration number `0012` assumes nothing else lands first. Renumber if another migration merges ahead.
- Contract change: `Room` gains optional `isPinned: boolean`. Workspace consumers (CLI does not read this field, web does) recompile from source — no separate build step needed.
- Independent of the global-board preview above; can ship in either order. Visually they stack on `/app` as: global preview → pinned preview → "Your rooms" grid.

---

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
- Aggregate metrics (member count, 30d tokens, 30d cost) are intentionally public to anyone with the room URL, including signed-out viewers and non-members of private rooms. This is a deliberate change to the prior "private rooms are 403 to non-members" semantics — accepted on the basis that aggregates aren't sensitive.

**Order constraints:** the `Heatmap` contract gains `range`; existing profile-heatmap consumer (`/u/<handle>`) must migrate in the same PR. No migrations.

---

### 🟩 `/trending` as the signed-out homepage

Signed-out visitors land on a live global leaderboard with today/7d/30d tabs (default `7d`). A slim hero strip — **wordmark + tagline + install snippet + GitHub sign-in** — sits above the board. The current "How it works" and "We literally can't read your prompts" sections move *below* the board. The sample-leaderboard section is deleted (the real one is right there). Signed-in users still redirect to `/app`.

**Touches:** `apps/web/app/page.tsx` (rebuild around `<TrendingClient initialRange="7d" />` + the new hero strip); `apps/web/app/trending/page.tsx` becomes a 301 redirect to `/`; OG meta on `/` switches from marketing framing to live-board framing; preserve `?ref=<code>` forwarding to the sign-in CTA (existing `pickRef()` regex stays); update any internal links pointing to `/trending`.

**Definition of done:**
- `/` signed-out: SSR's the live board at 7d, hero strip above, How-it-works + privacy strip below, footer unchanged. No mock data anywhere.
- `/` signed-in: `redirect("/app")` (unchanged).
- `/trending` returns **301 to `/`** for all viewers. Share-card routes under `/cards/trending/...` continue to render unchanged.
- Range tab switching keeps `?range=` in sync via shallow nav; bare `/` defaults to 7d.
- `?ref=<code>` still flows through to the GitHub OAuth start URL in the new hero CTA.
- `/` OG meta reflects the live-board content, not the marketing pitch (preview shows "today's top burners" framing).
- Hero strip contains wordmark + tagline + install snippet (`<InstallBlock>`) + GitHub sign-in button, in that visual order.

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
- Slug is **fixed at first submit**. Only `founder_name` and `founder_email` are editable on `/o/<slug>/pending`. If the founder typo'd the slug, they have to wait for admin approval and rename via the future org-settings flow — there's no withdraw-and-resubmit path in v1.

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
- Pre-existing manually-set handles are **left in place**. No purge migration. `/settings/profile` shows a banner to users whose handle is set but who haven't completed OAuth (detect via the lack of a `twitter_oauth_id`) prompting them to reconnect via OAuth to mark it verified. The pill renders unconditionally on the current handle until they reconnect or disconnect.

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

### 🟩 Web Push payload encryption

"Send test push" on `/settings/notifications` actually delivers a notification with a real title + body on **Chrome desktop and Android**. We don't write the crypto ourselves — vendor a Workers-compatible web-push library and replace the `webpush.ts` stub with calls into it. iOS Safari handling (PWA install prompt, "not supported" copy) is deferred — see [`roadmap-deferred.md`](./roadmap-deferred.md).

**Touches:**
- Add a Workers-compatible web-push dependency (candidates: `web-push-cf`, `@negrel/webpush`, or similar — pick whichever has a clean `crypto.subtle`-only implementation and an active maintainer). Verify it builds + runs under `wrangler dev` before merging.
- `apps/api/src/lib/webpush.ts`: keep the file as the project's wrapper (subscription parsing, VAPID JWT signing already works, payload encoding, error handling), but the actual ECDH + HKDF + AES-GCM goes through the vendored library — **no hand-rolled crypto primitives**. The VAPID JWT path stays as-is.
- 404 / 410 from the push service: hard-delete the offending row from `push_subscriptions`. Other 4xx/5xx propagate as errors but do not delete.
- Tests: load RFC 8291 vectors into a unit test that exercises the encryption wrapper (regardless of library — confirms the wired-up pipe produces RFC-conformant ciphertext). Manual E2E from `/settings/notifications` against Chrome desktop + Android before merge.
- No frontend changes required — `/settings/notifications` already has the test-push button.

**Definition of done:**
- "Send test push" on Chrome desktop and Android delivers a real notification (title + body + click-through URL).
- RFC 8291 vector tests pass.
- A subscription that returns 404 or 410 on send is deleted from `push_subscriptions` within the same request.
- No hand-written ECDH / HKDF / AES-GCM lives in our repo. `webpush.ts` only orchestrates the library + handles VAPID + parses subscriptions.
- iOS Safari users see the existing UI; clicking the test button silently no-ops (no special copy yet — that's deferred).

**Order constraints:**
- The vendored library must be vetted for Workers compatibility (no Node `Buffer`, no `node:` imports) before commit. If no library fits, surface that finding before falling back to a hand-roll.
- No contract changes.

**[OPEN]** Library choice — needs a 30-minute survey. List candidates, pick one, document the choice in the PR description.

---

### 🟩 Multi-device aggregation — reproduce and fix `vmarcial` regression

Confirmed by founder: users running the CLI on multiple PCs see only one machine's stats (reproducer: `vmarcial`). The current schema sums `sessions` by `user_id` with no per-device filter, so this should not happen — there's a real bug. **Blocks the device-list feature below**: shipping a per-device UI on top of broken aggregation would compound the problem. The fix is whatever the post-mortem reveals; we don't pre-suppose the cause.

**Investigation checklist (one finding determines the patch):**
- Pull `vmarcial`'s `sessions` rows from prod D1. Confirm whether PC1's rows landed at all. If never uploaded → CLI / login flow issue on PC1, not an aggregation bug.
- If both PCs' rows are present, check `daily_rollup` and `daily_rollup_by_model` totals against the raw `sessions` SUM for the same user_id and day range. Under-count in the rollups → ingest upsert bug.
- If raw + rollup totals match but the *UI* shows only one PC's data, the leaderboard / profile / `/me` query has an unintended filter (e.g., a stale `LIMIT 1` or wrong `GROUP BY`).
- Audit `dedupe_key` collisions across the two PCs. FNV-1a 32-bit gives ~1 collision per ~65k same-tuple sessions — possible but unlikely as the systemic cause. If this *is* the cause, the dedupe-key strengthening in [`roadmap-deferred.md`](./roadmap-deferred.md) moves out of deferred.

**Touches:** depends entirely on the finding. Plausible files: `apps/api/src/lib/ingest.ts`, `apps/api/src/routes/leaderboard.ts`, `apps/api/src/routes/me.ts`, `apps/api/src/routes/profiles.ts`, `packages/parsers/src/hash.ts`, `packages/cli/src/commands/sync.ts`. A short post-mortem note lands in `notes/` documenting the actual cause + the fix.

**Definition of done:**
- `vmarcial` and one other multi-PC user (recruited for verification) see a combined total that matches `SELECT SUM(in_tokens+out_tokens) FROM sessions WHERE user_id = ?` to the token.
- A regression test in the relevant Vitest suite covers the exact failure mode found (not a generic multi-PC test — specifically the bug that was there).
- The post-mortem note names the cause in one sentence and links to the test.

**Order constraints:**
- Independent of every other feature here. Ships first relative to the two device-track features below.
- Do **not** introduce per-device filtering in this feature. That's the next feature. This one only restores the existing user-level aggregation guarantee.

---

### 🟦 Anonymized device list with per-device filter on own profile

**Depends on:** the multi-device aggregation fix above (don't ship a per-device UI on top of broken aggregation).

Users with multiple PCs need a private view of *which devices have synced*, *when each last synced*, *what each contributed*, and the ability to **disconnect a device remotely** from the web. The whole surface is owner-gated — no one else ever sees a user's device list.

**Privacy posture (locked):** The server stores **no hostname, no OS string, no identifying metadata** per device — only an opaque `device_id`, the owning `user_id`, timestamps, upload counters, `cli_version`, and `revoked_at`. The CLI keeps a local `~/.config/token-rats/devices.json` mapping `{ device_id → { label, hostname, os } }` for *its own* machine. The web UI fetches the anonymized list from `/v1/me/devices` and shows "Device · `<short-id-prefix>`" by default; on the device itself (CLI on localhost), the user can optionally name it, and that label is stored client-side only.

**Touches:**
- New migration `0017_devices.sql`: `CREATE TABLE devices (device_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL, last_upload_count INTEGER NOT NULL DEFAULT 0, cli_version TEXT, revoked_at INTEGER, FOREIGN KEY(user_id) REFERENCES users(id))`. Index `(user_id, last_seen_at DESC)`. Add `sessions.device_id TEXT` (nullable; legacy rows stay null). Index `(user_id, device_id)`.
- CLI: generate a per-install UUID on first run, persist to `~/.config/token-rats/state.json`. Send as `X-Device-Id` (and `X-Cli-Version`) on every `POST /v1/sessions`. Older CLI versions without the header continue to ingest with `device_id = NULL`.
- `apps/api/src/lib/ingest.ts`: when `X-Device-Id` is present, upsert the `devices` row (creates on first sight, bumps `last_seen_at` and `last_upload_count`, sets `cli_version`) and stamp `sessions.device_id`. If `devices.revoked_at IS NOT NULL`, short-circuit ingest with `401 { error: "device_revoked" }`.
- New routes (mounted under `/v1/me`):
  - `GET /v1/me/devices` → `{ devices: [{ deviceId, createdAt, lastSeenAt, lastUploadCount, cliVersion, revokedAt, totals: { costUsdCents, tokens, sessions } }] }`. Totals come from a `SUM` over `sessions WHERE user_id = ? AND device_id = ?` scoped to the active range. **No hostname field. No OS field.**
  - `POST /v1/me/devices/:deviceId/revoke` → sets `devices.revoked_at = now()`. Future ingests from that device get 401. Idempotent. The CLI, on receiving 401 + `error: "device_revoked"`, deletes its local token and prints "This device was disconnected from the web UI. Run `token-rats login` to reconnect or remove this install."
- New private dashboard page `/app/devices` (owner-gated; 404 to anyone else even with the URL): renders one row per device with last-seen time, live indicator (placeholder until the daemon feature below ships), 30d totals per device, and a "disconnect" button that calls revoke. A `?device=<id>` query param applied on the existing `/app` dashboard filters the global summary + heatmap to a single device.
- The owner view on `/u/<handle>` gains a small private "your devices" panel below the existing private bits, linking to `/app/devices`. Visible only to the owner — same gate as the rest of the private profile content.
- New contract types in `packages/contracts`: `Device`, `MeDevicesResponse`. No leak of these into public surfaces.

**Definition of done:**
- A user with two devices sees both on `/app/devices` after the next sync from each, with non-zero per-device totals that sum to their global 30d total.
- Revoking a device returns 401 with `error: "device_revoked"` on its next upload; the CLI on that device prints the disconnect message and removes its local token; the row's `revoked_at` is set; the device still renders on `/app/devices` with a "Disconnected" pill (history is preserved, but no new ingest).
- `wrangler tail` on a production-traffic snapshot shows zero hostname / OS / system-info strings in any request, and the DB has no column capable of holding such data.
- A CLI from before this feature continues to ingest fine; its sessions land with `device_id = NULL` and show on `/app/devices` as a single "Legacy device" row.

**Order constraints:**
- Migration `0017_devices.sql` assumes the actual repo state — renumber to the next-available `00NN` if anything else lands first.
- The CLI change is opt-in via header presence, so it can ship in either order relative to the server change. Recommend server-first so the very first device-aware CLI release has a working `/v1/me/devices` to read.
- Don't add hostname / OS / label columns to the `devices` table "for future use" — the server-side anonymity is part of the contract with users.

---

### 🟦 Daemonized watcher installed by default + live-sync indicator

**Depends on:** the device list above (uses `devices` and adds `last_heartbeat_at` to it).

The daemon **is** the product. `token-rats sync` becomes a manual one-shot for power users; the daemon is what runs day-to-day on every device, picking up sessions before local logs can be rotated or wiped. Installed automatically at the end of `token-rats login` with a `--no-daemon` opt-out for users who prefer manual sync. A live indicator on `/app/devices` shows which devices are currently running the daemon.

**Touches:**
- New CLI subcommands `token-rats install-daemon`, `token-rats uninstall-daemon`, `token-rats daemon-status`. Per OS:
  - macOS: write `~/Library/LaunchAgents/com.tokenrats.watch.plist` with `RunAtLoad=true` + `KeepAlive=true`, then `launchctl load`.
  - Linux: write `~/.config/systemd/user/token-rats-watch.service`, then `systemctl --user enable --now token-rats-watch.service`.
  - Windows: register a Scheduled Task triggered at logon via `schtasks` (or PowerShell).
- `token-rats login`: on successful auth, run `install-daemon` as the final step. Print the daemon location, a one-liner to remove it, and a pointer to `/cli/daemon`. A `--no-daemon` flag skips the install; the same flag is honored on future re-logins.
- `packages/cli/src/commands/watch.ts`: persist per-file watch state under `~/.config/token-rats/watch-state.json` as `{ path, inode, size, lastProcessedOffset, lastUploadedAt }`. On restart, skip already-processed bytes. When `current size < persisted size`, treat as a log rotation: log a warning, keep what we already captured, and reset the offset — no attempt to recover the lost bytes.
- Heartbeat: the watcher posts `POST /v1/me/devices/heartbeat` every 60s (or piggybacks on the existing ingest call with an `X-Heartbeat: 1` header on empty-payload requests if the rate-limit budget is too tight). Updates `devices.last_heartbeat_at`, a new column added in the same migration as `devices` (or via a follow-up `0018` migration if shipping order forces it).
- `GET /v1/me/devices` response gains `lastHeartbeatAt` and a derived `isLive: boolean` (true if heartbeat is within the last 5 min).
- `/app/devices` UI: green pulse next to live devices, gray dot otherwise. Disconnect button now also stops the running daemon — the CLI, on receiving `401 { error: "device_revoked" }` from its next heartbeat, exits with a "disconnected by user" log line and is *not* re-launched (KeepAlive is overridden by writing a `~/.config/token-rats/disconnected` sentinel that the launchd/systemd unit checks before starting).
- New static page `/cli/daemon` documenting: install/uninstall commands, where state lives, the heartbeat cadence, the no-hostname-on-server promise, and the disconnect-from-web flow.

**Definition of done:**
- `token-rats login` on a fresh machine ends with a running daemon that survives logout / login on all three platforms.
- Within 60s of the first heartbeat, `/app/devices` shows the device with a green live indicator.
- Killing the daemon process (`launchctl unload` / `systemctl --user stop` / Task Scheduler stop) flips the dot to gray within 5 min.
- Revoking the device via `/app/devices` causes the daemon to exit cleanly on its next heartbeat, log "disconnected by user", and not auto-restart.
- A user who runs `token-rats login --no-daemon` ends up with **no** background process; they can still run `token-rats sync` manually.
- Logs on the wire and in D1 contain no hostname / OS / machine-name strings (verified via `wrangler tail` + DB schema review).
- The watcher correctly handles a mid-session log rotation: it warns, snapshots what it had, and continues from the new file.

**Order constraints:**
- Ships after the device list. The `devices.last_heartbeat_at` column lands in the device-list migration (`0017_devices.sql`) or as a tiny follow-up `0018` migration depending on which ships first.
- The `/cli/daemon` docs page must clearly state the no-hostname-on-server promise so users feel safe leaving a background process running.
- The autorun decision in `login` is the locked product stance — don't gate it on a checkbox in the CLI prompt. The `--no-daemon` flag is the escape hatch for power users; the *default* is install-and-run.

---

### 🟨 Playwright smoke suite

Not user-visible; a CI gate. Specs run against a **real `wrangler dev` Worker** (not MSW) with a fresh local D1 file seeded per spec, so contract drift is caught end-to-end. Browser matrix: **Chromium + WebKit** (no Firefox). Path-filtered gate: smoke runs block PR merge **only when the PR touches `apps/web/**` or `packages/contracts/**`**; api-only or CLI-only PRs skip the smoke job. No visual / screenshot diffs in v1 — behavioral assertions only.

**Spec list (matches what we're actually shipping):**
1. **Install → first card** — install snippet on `/`, run `npx token-rats login`, sync a fixture log, assert the first leaderboard row + OG share card render.
2. **Signed-out homepage** — `/` renders the live trending board with 7d default, hero strip above, How-it-works + privacy strip below; `/trending` 301s to `/`; `?ref=<code>` survives the GitHub sign-in CTA.
3. **Heatmap range toggle** — `/u/<handle>` and `/r/<code>` default to 30d; clicking the toggle swaps to 52w and updates `?range=` in the URL.
4. **Room stat strip + group streak** — `/r/<code>` shows Members · 30d tokens · 30d cost; group-streak pill reflects ≥1-member-active-day rule with a seeded fixture.
5. **Soft-create org flow** — POST /v1/orgs → 201 → `/o/<slug>/pending` renders confirmation + editable name/email form; second create from same user → 409.
6. **Admin approval** — admin user (seeded via `ADMIN_GITHUB_LOGIN`) searches pending orgs and clicks approve; member-only endpoints unblock.
7. **Email capture interstitial** — pre-deploy user (seeded with `email = NULL`) is redirected once through GitHub OAuth on first page load; post-callback, `users.email` is populated, no re-redirect.
8. **Twitter connect / disconnect** — Connect X → OAuth round-trip (stub the X side at the network layer for this spec only) → pill renders on `/u/<handle>`, `/r/<code>` member list, friends view. Disconnect → pill disappears everywhere.
9. **Country-locked groups** — `cf-ipcountry` header injected; create a public room as `DE` user, verify a `US` user can view `/r/<code>` but join is replaced with the country pill; `/groups` lists the room for `DE` and not for `US`.
10. **Test-push toast** — `/settings/notifications` "Send test push" hits the real wrapper; mocked push service returns 201; UI shows the success toast. (Subscription invalidation path uses a mocked 410 to assert the row gets hard-deleted.)
11. **Multi-device aggregation** — seed two `device_id`s under the same `user_id` with non-overlapping `sessions`; assert the leaderboard / `/me` / `/u/<handle>` totals equal the SUM across both. Specifically asserts the `vmarcial`-class regression cannot recur silently.
12. **Devices page + revoke** — seed two devices, hit `/app/devices` as the owner (renders both rows with per-device totals), as a non-owner (404), then `POST /v1/me/devices/:deviceId/revoke` and assert the next ingest from that `device_id` returns 401 `{ error: "device_revoked" }`. Confirms the row keeps history but stops accepting writes.
13. **Daemon heartbeat → live indicator** — fake-heartbeat a `device_id` and assert `GET /v1/me/devices` returns `isLive: true` within 60s and reverts to `false` after 5 min of silence. Confirms the live indicator's timing contract.

**Touches:**
- New directory `apps/web/e2e/` with one `*.spec.ts` per item above.
- `@playwright/test` dev dependency at the workspace root. No MSW.
- A per-spec setup helper that: (a) starts `wrangler dev` against a fresh tmp D1 file with migrations applied, (b) seeds fixtures, (c) tears down. May share one worker per spec file via Playwright's worker fixtures.
- New CI workflow file (or extension of `ci.yml`) with a `paths:` filter on `apps/web/**` and `packages/contracts/**`. Runs the Chromium + WebKit matrix.
- Document the local run path in `apps/web/README.md` or `CLAUDE.md`.

**Definition of done:**
- All 13 specs pass on Chromium and WebKit locally and in CI.
- A PR touching only `apps/api/**` or `packages/cli/**` does **not** trigger the smoke job (verified once after merge).
- A PR touching `apps/web/**` cannot merge with a failing or skipped smoke job.
- Seed helpers + the wrangler-dev harness live in `apps/web/e2e/_setup/` (or similar) and are reusable across specs.
- No screenshot baselines committed; specs are behavior-only.

**Depends on:** every other feature in this list landing first so the specs assert real surfaces. Ships last.

---

## Coordination notes

Cross-feature races that the author of the *second* PR to land in each pair must resolve:

- **Migration numbering.** Three features need new D1 migrations: #3 (`0009_orgs_pending.sql`), #4 (`0010_users_email.sql`), #6 (`0011_rooms_public.sql`). The numbers in this file assume *that* order. Whoever lands second or third must renumber to whatever the previous migration was + 1, and update the touches line in their PR description.
- **Room contract / `RoomView.tsx`.** Feature #1 adds the stat strip + heatmap + streak to the top of `RoomView.tsx`; feature #5 adds the Twitter pill to the member list; feature #6 adds the country-mismatch join pill. Three features all editing the same file means whoever merges second has to rebase the third. Coordinate by merging in `#1 → #6 → #5` order (heaviest UI changes first) if the calendar allows.
- **`orgs.plan` CHECK widening (#3).** This is a table-rebuild migration that briefly locks the `orgs` table. Don't ship it concurrently with anything that writes to `orgs`.
- **`Heatmap` contract change (#1).** Adding the `range` field to the shared `Heatmap` contract type breaks the existing `/u/<handle>` page until the consumer migrates. Same-PR migration is the design intent — don't split.

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
- **Taskbar app is deferred until after the repo is open-sourced.** When we revisit, it's cross-platform (macOS + Windows tray) via Tauri 2.x. See [`roadmap-deferred.md`](./roadmap-deferred.md) for the locked design decisions.
- **Multi-device aggregation is server-side via `user_id` SUM.** No per-device source of truth. The device dimension is a *view*, not a primary key for usage. Per-device filters on the UI hit the same rows the global query reads, with an extra `AND device_id = ?` clause.
- **Server stores no hostname / OS / identifying metadata per device.** Only an opaque `device_id`, the owning `user_id`, timestamps, upload counters, and `cli_version`. Friendly device names live client-side in `~/.config/token-rats/devices.json`. Confirmed locked 2026-05-21 — this is a privacy commitment, not an implementation detail.
- **The daemon is the product.** `token-rats login` installs and starts a background watcher by default on macOS / Linux / Windows. Manual `token-rats sync` becomes a power-user one-shot. A `--no-daemon` flag is the escape hatch; the default is install-and-run.

## Explicitly deferred

Real signals that won't ship in this cycle.

- Auto-post weekly recap to X — needs paid X API tier. Revisit if Twitter OAuth adoption is high.
- Friend requests / one-way follows — derived friendship covers the wave.
- iOS push — still known-broken in Safari. Document, don't chase.
- Reviving the paid org plan publicly — gated on student-org cohort feedback + D7 retention.
- Taskbar app (entire v1) — deferred until after open-sourcing the repo. See [`roadmap-deferred.md`](./roadmap-deferred.md).
- VS Code extension as a source — Cursor cache covers most of the surface. Provider expansion lives in [`notes/provider-expansion.md`](./notes/provider-expansion.md).
- Anti-cheat / verification — not the bottleneck.
- **Cloud-side usage retrieval** (Anthropic / OpenAI / Cursor / ChatGPT account OAuth) — Investigated 2026-05-21: Anthropic banned third-party OAuth into Claude Pro/Max in Feb/Apr 2026 and the Admin API is org-owner-only and unreliable for subscription Claude Code usage. OpenAI "Sign in with ChatGPT" is identity-only with no usage endpoint. Cursor's analytics API is Enterprise-tier. Revisit only if a provider ships user-scoped usage OAuth.
- **OpenRouter as a cloud source** — Has user-OAuth + daily aggregate usage but covers a tiny audience and lacks per-message dedupe. Deferred until a customer specifically asks for it.
- **Strengthen `dedupe_key` to SHA-256 + include `session_id`; drop token counts from the key material.** Defer until the multi-device aggregation post-mortem tells us whether dedupe collisions were the cause. If yes, schedule a backfill migration in the next cycle; if no, leave the FNV-1a path alone.
- **Proxy-mode promotion to a primary capture path.** Privacy review + per-machine `ANTHROPIC_BASE_URL` setup friction make it as costly as installing the CLI; the daemon-by-default path is preferred.

---

_Last reviewed: 2026-05-19._
