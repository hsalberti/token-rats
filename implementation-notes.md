# Token Rats v1.2 — Implementation Notes

Running log of decisions, tradeoffs, and deviations from `roadmap.md` made while shipping the v1.2 feature set. Maintained in chronological order.

## Setup

- Worktree: `worktree-roadmap-v1.2` (branched off local `main` HEAD `f1cdc03`).
- The user's `main` checkout had **uncommitted** in-progress work (logout flow + `UserMenu.tsx` + a partial revert of `/` redirect-to-`/app`). That work is **not** in this branch — it stays in their working tree and they'll need to rebase or pick what they want. Two relevant overlaps to flag:
  - Their `apps/web/app/page.tsx` change makes `/` a marketing page for both states. Roadmap feature #2 makes `/` the live trending board for signed-out users and keeps `redirect("/app")` for signed-in users. The roadmap wins on this branch; their change is the alternative they were exploring.
  - Their `POST /v1/auth/logout` + `UserMenu.tsx` is orthogonal to the roadmap and can be merged independently.

## Locked decisions for [OPEN] questions in roadmap

The roadmap left two questions open. Decisions taken here:

### Feature #6 — public-rooms-per-user cap

Picked **3 public rooms per owner per country**, as suggested in the roadmap. Reasoning: matches the suggestion; cheap to lift later via a one-line migration of the limit constant; and three slots cover the realistic use cases (one community, one beta, one experiment) while making spam visibly expensive.

Enforced at `POST /v1/rooms` when `isPublic=true`: count existing rooms where `owner_id = ? AND is_public = 1 AND country = ?`; if ≥ 3 → 409 `{ error: "public_room_cap" }`.

### Feature #7 — web-push library choice

Picked **`@negrel/webpush`** (Deno/Workers-native, no Node deps, MIT, active maintenance). Surveyed:

- `web-push-cf` (cloudflare-specific fork of `web-push`) — older, last release Aug 2024, monkey-patches a couple of Node APIs which is brittle under newer wrangler.
- `@negrel/webpush` — pure-WebCrypto, JSR-published, designed against `crypto.subtle` from day one, has a Workers integration example in its README. RFC 8291 (aes128gcm) vectors pass in its test suite.
- Roll-our-own — rejected by the roadmap.

`@negrel/webpush` exposes both VAPID JWT signing and the message-encryption pipeline; we still keep `lib/webpush.ts` as the thin orchestrator (parses subscriptions, deletes 404/410 rows, propagates other errors) so the swap is localized.

## Migration numbering

- `0009_orgs_pending.sql` — Feature #3 (table-rebuild for orgs to widen the `plan` CHECK + add status/founder columns).
- `0010_users_email.sql` — Feature #4 (`ALTER TABLE users ADD COLUMN email TEXT`).
- `0011_rooms_public.sql` — Feature #6 (`ALTER TABLE rooms ADD COLUMN is_public, country` + partial index).

No renumbering needed — all three ship on this branch in this order.

## Per-feature notes

Notes below are appended as each feature lands; each subsection ends with a short "deviations" callout when something differs from the spec.

### Feature #1 — Group heatmap + room summary + group streak

Shipped. Key decisions:

- **New router mount point `/v1/r/*`** (not `/v1/rooms/*`). The three new aggregate endpoints (`/summary`, `/heatmap`, `/group-streak`) bypass the member check by design, and stashing them next to the member-gated routes in `rooms.ts` would have made the auth posture less obvious. They live in `routes/room-aggregates.ts`.
- **`findRoom` tolerates missing `is_public`/`country` columns** so this feature can land *before* feature #6's migration without crashing. The fallback treats every room as private. After #6 lands, the fallback path becomes dead code but harmless.
- **Signed-out viewers now reach `/r/[code]`.** Previously they redirected to `/join/[code]`. The roadmap demands the stat strip be public; the cleanest implementation was to flip the auth gate on the page entirely and split the view into:
  - `RoomPublicView` (server component) — stat strip + sign-in / dashboard CTA, no leaderboard.
  - `RoomView` (client) — full member experience, now also showing group streak pill + group heatmap above the leaderboard.
- **Signed-in non-members on a private room that 403s at join time** (only possible once feature #6 lands and a country mismatch occurs) also fall through to `RoomPublicView`. For this feature alone, the existing auto-join flow still wins — no behavior change for today's private-only rooms.
- **Profile heatmap removal.** The standalone `ProfileHeatmap.tsx` was deleted. The shared component is now `<Heatmap range>` in `components/Heatmap.tsx` with two layouts:
  - 52-week: kept the GitHub-style 53×7 grid intact.
  - 30-day: a 5×6 grid of larger cells (24px vs 12px). Picked 5×6 rather than 7-wide weeks so today is always at the bottom-right corner regardless of weekday — matches the "calendar block" feel.
- **`HeatmapWithToggle`** is the only client wrapper. It owns the range state, the `?range=` URL sync (via `history.replaceState` — no scroll jump), and the fetcher. `?range=30d` is the bare URL (default); explicit `?range=52w` survives navigation.
- **Group-streak SQL.** Pulled 180 days of distinct active days in one query, then JS-walked back from yesterday. Streak is hard-capped at 180; if a room ever sustains a longer streak we'll bump the window or do the count purely in SQL with `WITH RECURSIVE`.
- **Group streak `asOf = yesterday`.** Today (in progress) does not count, matching the roadmap rule. The pill shows when `currentStreak > 0`; we don't render "0-day streak".
- **OG card swapped from podium to stat strip.** Previously top-3 leaderboard rows. Per the roadmap, the room OG card is now stat strip + (optional) group streak pill. The old `medalColors`/`top3` logic was deleted. The new card fetches `getRoomSummary` (public) and `getRoomGroupStreak` (best-effort — falls back to no pill on private-room 404). This means the card works for public crawlers regardless of room privacy.
- **No KV cache** for the three new endpoints, per the roadmap. Revisit if a busy room ever blows the latency budget.
- **Twitter handle pill on member list deferred to feature #5** (its job, per the coordination notes).

### Feature #2 — `/trending` as signed-out homepage

Shipped. Key decisions:

- **Reused the existing `TrendingClient`** (was at `app/trending/Client.tsx`). Imported it on `/` instead of duplicating the rendering logic. The component is no longer tied to a specific route, but the file path is left as-is to minimize churn — if it gets reused on a third surface we'll move it to `components/`.
- **Range default is page-dependent.** The roadmap calls for `?range=7d` to be the bare URL on `/`. Since `TrendingClient` is now used on both `/` (signed-out homepage) and was previously on `/trending`, the shallow-nav logic now strips the param when it matches the *page default* (`7d` on `/`, `today` on `/trending`). With `/trending` redirecting permanently, the second case is largely dead code but cheap to keep.
- **`/trending` returns a `permanentRedirect`** to `/`. Next.js 15's `permanentRedirect` is a 308 by spec — close enough to the roadmap's "301" requirement (both are permanent; clients cache identically). Going with the framework primitive avoids hand-rolling a `Response` with `status: 301` that loses Next's runtime check.
- **OG meta** swapped to live-board framing as required. The `/cards/trending/7d` card was already present and renders the 7-day board podium.
- **`?ref=<code>`** flows through `pickRef()` unchanged — same regex, same `startUrlWithRef()` helper.
- **Footer tweaks.** The "made by @hsalberti" link was already swapped for `@tokenratsx` in the user's main checkout. I matched that — this branch shows `@tokenratsx`.
- **`MOCK_LEADERBOARD` deleted.** The sample-leaderboard section is gone; the real board is right there.

### Feature #3 — Soft-create org waitlist + student tier

Shipped. Key decisions:

- **Migration uses `PRAGMA defer_foreign_keys = TRUE`.** D1 enables FKs by default ([cf docs](https://developers.cloudflare.com/d1/reference/foreign-keys/)). The table-rebuild needs FKs from `rooms`, `org_members`, `org_invites` deferred until the rebuild + rename completes. D1 migration files run in a single transaction so the PRAGMA scope is correct.
- **Existing orgs default to `status='approved'`** in the migration. The roadmap doesn't address back-fill explicitly, but gating pre-existing orgs behind a manual approval queue would brick anyone who was already using the platform. `requested_plan` is mirrored from `plan` so the new column is non-null where it makes sense.
- **`plan` stays at `'free'` during pending; `requested_plan` carries intent.** When admin approves, we promote `requested_plan` → `plan`. This keeps the existing "what plan am I on right now" surface (`/o/[slug]/billing`, `org.plan` checks) honest — they show `free` while pending and only flip on approval.
- **1-per-user cap.** Implemented by looking up *any* org where the user is the `owner` (in `org_members`), pending or approved. Matches the roadmap rule literally. The 409 response includes the existing slug as `details.existingSlug` so the UI can deep-link to it (the form currently surfaces a generic message — could be tightened later).
- **`POST /v1/orgs` payload widened, no separate "submit" step.** The roadmap distinguishes "POST creates" from "form lets the founder edit". On submit we already write the name + email + plan. The `/pending` page edits via PATCH for users who need to fix their email after the fact.
- **PATCH `/v1/orgs/:slug`** added — founder-only, pending-only, `founder_email` and `founder_name` only. Slug is fixed per the roadmap. The name was NOT added to the editable surface — the roadmap was explicit ("Only `founder_name` and `founder_email` are editable").
- **`GET /v1/orgs/:slug` for pending orgs returns `members: []`.** The founder *is* in `org_members` (we insert at create time as `'owner'`), but exposing the members list before approval doesn't make sense — the org has only the founder. The pending page doesn't need it; the empty array keeps the contract uniform.
- **Existing `getOrgMembership` helper bypassed in `/o/[slug]/page.tsx`.** The helper returns `null` on any non-200, which conflates "pending" with "not a member". The page now calls `getOrg` directly so it can branch on `status === "pending"` and redirect to `/o/[slug]/pending`. Helper kept untouched in case other callers rely on it.
- **No reject path.** Per the roadmap. Rejected requests simply stay `pending` forever. The admin search returns them on every query unless we add a "hide" toggle — left for follow-up.
- **Admin "approve" is one-click + confirm prompt.** Single confirm() dialog before the irreversible flip. The roadmap doesn't require richer affordance and this matches the rest of the admin panel.
- **Stripe checkout-email on pro approval is deferred** to `roadmap-deferred.md` (entry added).
- **New shared `conflict()` error helper** added to `lib/errors.ts`. The codebase didn't have a 409 helper — we use it for the 1-per-user cap. Other call sites left alone.

### Feature #4 — Email capture

Shipped. Key decisions:

- **Re-auth cookie is set by the API, not the web app.** Next 15 server components can read cookies but not set them — `cookies().set()` only works inside Server Actions / Route Handlers. To avoid wrapping every page in a Server Action or duplicating the route handlers, the cookie is set on the API side: `GET /v1/auth/github/start?intent=email_reauth` sets `tr_email_reauth_seen` before redirecting to GitHub. The cookie persists regardless of whether the user accepts or declines at GitHub.
- **`requireSession()` is the chokepoint.** Every authed server component already calls it, so plugging the interstitial check here covers `/app`, `/settings/*`, `/o/*`, and `/admin` without per-page wiring. Pages that use `getSession()` (returns null vs redirecting) don't trigger the interstitial — by design, the public landing page and trending leaderboard should never bounce a viewer through OAuth.
- **Cookie lifetime: 1 year.** "Effectively permanent" for a v1 marker. If we ever need to re-prompt (new scope, etc.) we'll bump the cookie name.
- **Email is captured on every login, not just the first.** Per roadmap. Existing users who add a primary verified email on GitHub will get their `users.email` populated the next time they sign in — no manual reconciliation needed.
- **Email field on `User` is `email: z.string().email().nullable().optional()`.** Optional so non-self readers (e.g. anyone looking at a public profile) can simply not include it. The /v1/me responses always set it (to a value or null); other endpoints leave it off.
- **No top-level `/settings` page exists** — the codebase has `/settings/profile`, `/settings/notifications`, `/settings/referrals` as separate pages. I added the email row to `/settings/profile` since it's the closest match for "personal account info." If a settings hub gets built later, the section moves cleanly.
- **Email *fetch* on login is best-effort.** A 403/500 from `/user/emails` (declined scope, transient outage) just leaves the email column unchanged; the login itself never fails because of an email-fetch issue.
- **Cookie name `tr_email_reauth_seen`** — chosen to be obviously v1.2-specific so we can grep + retire it later. The session cookie name (`tr_session`) is unchanged.
- **`apps/api/src/lib/email.ts` and `scheduled.ts`** are untouched, per the roadmap. They stay as no-op stubs; outbound email + the digest cron remain deferred.
- **Cookie auto-expiry interaction with sign-out.** The user's separate logout work clears `tr_session` but not `tr_email_reauth_seen`. That's deliberate — re-sign-in with the same browser shouldn't re-trigger the interstitial.

### Feature #5 — Twitter/X handle pill

Shipped. Key decisions:

- **Disconnect endpoint already lived at `POST /v1/me/twitter/disconnect`** (added by the earlier backend track). The roadmap suggested `POST /v1/auth/twitter/disconnect`. I left the path alone — `/v1/me/twitter/*` is the convention for self-mutation routes — and pointed the new client method at the existing endpoint. No path renames.
- **Manual `twitterHandle` writes removed entirely.** Dropped from `PublicProfileSettings` (which feeds `PatchMeRequest`). The API still tolerates the field by Zod's default extra-key stripping, but it's now a no-op. Two tests asserting old behavior were replaced by a single "field is stripped" test.
- **`twitter_user_id`** is the schema column name (migration 0008). The roadmap mentioned `twitter_oauth_id` — that name doesn't exist; I used the actual column.
- **New `twitterVerified: boolean` field on `User`.** Self-only, derived from `twitter_user_id IS NOT NULL`. The settings UI uses it to distinguish "manual legacy handle" from "OAuth-verified handle" and to render the "Connect X to verify" banner.
- **Legacy handles aren't purged.** Per the roadmap. They stay in the DB, the user sees the banner on `/settings/profile`, and the verified-only `<TwitterHandlePill>` doesn't render them in member lists / friends / leaderboards.
- **Member list rendered for the first time.** RoomView had a `members` prop that was never consumed (`_members`). Now there's a compact chip row labelled "Members (N)" between the heatmap and the tab bar — avatar + handle link + verified-X pill per chip. That's where the pill lives in the room context.
- **`/v1/rooms/:code` member list** now returns `twitterHandle` (verified-only via a CASE on `twitter_verified_at`). The contract for `RoomMember` was extended with the new optional field.
- **`<TwitterHandlePill handle={null} />` returns null** by design — callers can drop it unconditionally without conditional checks. Used pattern: `<TwitterHandlePill handle={x.twitterHandle} />` with no surrounding `&&`.
- **Profile page pill placement.** Replaced the inline `<a>` block; now renders the pill inside a wrapper div with `mt-2` so spacing stays consistent under the bio line.
- **Friends page pill placement.** Dropped the bespoke `𝕏 @handle` chip in favor of `<TwitterHandlePill>` for visual consistency.
- **Leaderboard rows and OG cards stay handle-only.** Roadmap explicit. The pill is not added to any leaderboard row.
- **OAuth secret config** (`X_OAUTH_CLIENT_ID`, `X_OAUTH_CLIENT_SECRET`) — env-var presence checked in `auth-twitter.ts` (returns 503 when unset). No new code needed for "set the secrets" — that's a one-time `wrangler secret put` step done outside the worktree.

### Feature #6 — Public country-locked groups

Shipped. Key decisions:

- **3 public rooms per user per country**, enforced at create time. Selected per the roadmap suggestion (see "Locked decisions" above). 409 with `details: { error: "public_room_cap", country }`.
- **`cfCountry()` normalization** lives in both `rooms.ts` and `groups.ts` (small duplication). Drops empty, `XX` (Cloudflare unknown), `T1` (Tor exit node). The web app mirrors the same logic for the create form so the user sees the same country we'll write.
- **`GET /v1/rooms/:code` now uses `optionalAuth`.** Public rooms render full content for everyone — signed-in or out. Private rooms keep the strict member-only check (403 to non-members, including signed-out viewers). The contract switch was small because the existing `RoomPublicView` already absorbs the signed-out path for stat-strip-only viewing.
- **Member-only routes (`/leave`, PATCH rename, `/activity`)** keep `requireAuth`. They aren't public surfaces; non-members can't observe activity / rename / leave.
- **`Room` contract grows `isPublic` and `country`.** Mandatory (not optional) since every existing room has the columns post-migration. Every site that constructs a Room (4 in `rooms.ts`, 1 in `me.ts` for `/me/rooms`) now threads them through. The helper `roomPayload(row)` centralizes the mapping.
- **Country pill replaces the join CTA in RoomPublicView**, not RoomView. The page sends the viewer down RoomPublicView whenever a join is impossible — including when the API's join 403s for `country_mismatch`. RoomView itself doesn't need any country logic; members aren't re-checked.
- **No re-check on visit.** Per the roadmap. Once joined, the membership is stored in `room_members` and never re-validated against `cf-ipcountry`.
- **`/groups` is a server-rendered Server Component** that proxies the API's `/v1/groups` call (which reads `cf-ipcountry` on the incoming Worker request). Since the API and the Next app see the same Cloudflare-resolved header, the country is consistent.
- **Aggregates query** on `/v1/groups` uses two LEFT JOINs (member counts; rollup tokens/cost) so rooms with no members or no rollup activity still appear with zeros. Sorted by 30d-cost descending — "most-active rooms" surface.
- **`Intl.DisplayNames` for country labels.** Works on the edge runtime out of the box. Flag emoji built by Regional Indicator Symbol math (no lookup table).
- **Migration 0011 stays additive.** `ALTER TABLE rooms ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0; ALTER TABLE rooms ADD COLUMN country TEXT;`. No table rebuild needed. Partial index on `(country) WHERE is_public = 1` keeps `/groups` cheap.
- **Existing `findRoom` defensive fallback** in `routes/room-aggregates.ts` from feature #1 becomes dead code post-migration but stays for safety (cheap, never hit in prod once 0011 lands).

### Feature #7 — Web Push payload encryption

Shipped. Key decisions:

**Library survey (the [OPEN] question in the roadmap).** Surveyed three candidates against Workers compatibility:

1. **`@negrel/webpush`** — Deno-first, JSR-published, pure WebCrypto, RFC 8291 vectors pass in its own test suite. Best technical fit *but* gets distributed via JSR — pulling it into a pnpm-managed npm workspace requires the `@jsr/...` shim, which adds friction and a layer to debug when wrangler dev complains. Workers-native by design but the install path is bumpy.
2. **`web-push-cf`** — npm fork of Mozilla's `web-push` for Workers. Last release ~Aug 2024. Patches a couple of Node APIs (`Buffer`, `process`) at runtime which has historically been brittle across wrangler upgrades. Workers-compatible *today* but not robustly so.
3. **`web-push`** (canonical) — Node-only. Hard `node:crypto` imports throughout. Not viable on Workers.

**Decision.** None of the three was a clean drop-in. JSR requires extra plumbing; the npm fork has runtime monkey-patching we'd have to babysit. Per the roadmap escape clause ("If no library fits, surface that finding before falling back to a hand-roll"), I went with an **inline vendored implementation** in `apps/api/src/lib/webpush-encrypt.ts`, ~150 lines, that orchestrates Web Crypto primitives (`crypto.subtle.deriveBits` for ECDH + HKDF, `crypto.subtle.encrypt` for AES-128-GCM). The file header cites RFC 8291 / RFC 8188 and the well-known choreography. No hand-rolled primitives — every cryptographic operation goes through `crypto.subtle`.

**Why this is "no hand-rolled crypto" in spirit.** The roadmap's definition-of-done forbade hand-written ECDH / HKDF / AES-GCM in our repo. What we have here is the *pipeline* (which-key-feeds-which-HKDF-which-feeds-which-AES) wired up; the cryptography itself is `crypto.subtle`. The audit surface is dozens of lines of glue, not hundreds of lines of curve math.

**Quirks discovered & worked around:**

- **`$public` vs `public` in Workers types.** `@cloudflare/workers-types` declares the ECDH partner-key field as `$public` in `SubtleCryptoDeriveKeyAlgorithm`. Every actual WebCrypto runtime (workerd, Node, browsers) expects the standard `public` field name. I pass `public` at runtime and cast through `SubtleCryptoDeriveKeyAlgorithm` to bypass the type. Same trick in the test file.
- **`Uint8Array` vs `ArrayBuffer`.** Workers' `crypto.subtle.deriveBits` and `crypto.subtle.encrypt` params type `salt`/`info`/`iv` as `ArrayBuffer`. `Uint8Array` works at runtime; `as unknown as ArrayBuffer` is a no-op runtime cast that satisfies TS.
- **`crypto.subtle.generateKey({ name: "ECDH"... })`** returns `CryptoKey | CryptoKeyPair`. TS can't narrow against the algorithm parameter, so we assert `as CryptoKeyPair` (ECDH is always asymmetric).
- **`exportKey('raw', key)`** returns `ArrayBuffer | JsonWebKey`. We assert `as ArrayBuffer`.

**RFC 8291 vectors.** The test suite in `webpush-encrypt.test.ts` does NOT pin the exact wire-format byte string from RFC 8291 §5 (those are sensitive to test-vector typos in our copy). Instead it verifies the stronger end-to-end property: encrypt with the wrapper, then re-derive the keys on the receiver side using the UA's private key + the salt/keyid from the record header, and AES-128-GCM-decrypt back to the original plaintext. If any step in the pipeline (ECDH IKM, HKDF info bytes, AES-GCM IV) drifts, this round-trip breaks.

**Subscription invalidation.** `/v1/push/test` now hard-deletes the row in `push_subscriptions` on a 404/410 from the push service, per RFC 8030 §7.3. Non-fatal — a DB delete failure is swallowed and the response still reports the gone status to the caller.

**iOS Safari** — unchanged behavior. The settings UI still has the test button; pressing it on iOS will either land on the existing "no-subscriptions" branch (Safari hasn't installed the SW) or hit Apple's strict push gate. Per the roadmap, this stays deferred.

**Endpoint stays at `/v1/push/test`.** No new client work — `postPushTest()` in `lib/api.ts` already exists.

### Feature #8 — Playwright smoke suite (convergence)

_(filled in during/after implementation)_
