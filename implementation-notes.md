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

_(filled in during/after implementation)_

### Feature #5 — Twitter/X handle pill

_(filled in during/after implementation)_

### Feature #6 — Public country-locked groups

_(filled in during/after implementation)_

### Feature #7 — Web Push payload encryption

_(filled in during/after implementation)_

### Feature #8 — Playwright smoke suite (convergence)

_(filled in during/after implementation)_
