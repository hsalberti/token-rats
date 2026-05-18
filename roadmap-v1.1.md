# Token Rats — Roadmap v1.1

v1 (Phases 0–3) is on disk and merged. 98 tests pass. The pipeline runs end-to-end. What v1 has not done is meet a real audience: the only signal so far is a private Discord. v1.1 is therefore a **sharpening pass** — one viral feature, one strategic deprioritization, and the unsexy reliability work that lets the social loop actually fire when a stranger from X clicks `npx token-rats`.

Same legend as `roadmap.md`:
- 🟦 **Sequential** — must finish before the next thing starts.
- 🟩 **Parallel** — can run alongside other 🟩 tracks in the same phase. Spawn one agent per track.
- 🟨 **Convergence** — short serial step where parallel tracks merge.

---

## Strategic frame (read before picking up a track)

- **Audience and surface:** X reply-guy guerilla, no fixed launch date. Every share card pasted into a reply is the entire marketing plan. Optimize for share-card quality and the X→install conversion path, not for HN-scale traffic spikes.
- **Primary metric to move:** friend-graph activation (% of signed-up users in a room with ≥1 friend). It's the most at-risk v1 metric and has the weakest engineering lever today. The v1.1 wedge is built to drag a second user into a room from a single tweet.
- **What we hide, not delete:** the paid org plan. Schema and code stay; the surface goes dark until consumer pull justifies a trust-and-billing surface.
- **What we harden:** the boring stuff that has to work when a stranger installs (real Web Push payloads, a real email column + provider, browser-level smoke coverage).
- **Out of scope for v1.1:** GTM / launch ops live outside this doc. The roadmap is engineering-only.

---

## Phase 4 — Sharpen the edge (🟩 5 parallel tracks, ~1 week)

Five tracks, all independent on the contracts and DB after Phase 0. Track P is the only one that touches `packages/contracts` and needs a tiny addition there before fan-out; the other four don't.

### 🟩 Track P — Head-to-head "you vs friend" cards

**Owner:** Agent P (supervise personally — this is the v1.1 wedge)
**Inputs:** existing leaderboard SQL, existing card renderer (`apps/web/app/cards/`)
**Outputs:** new compare endpoint, new web route, new OG card

- Add `LeaderboardCompare` to `packages/contracts`: `{ range, a: LeaderboardRow, b: LeaderboardRow, delta }`.
- New route: `GET /v1/rooms/:code/compare?a=<handle>&b=<handle>&range=today|7d|30d|all` — read from `daily_rollup`, both users must be room members, 404 otherwise.
- New web route: `/r/[code]/vs/[a]/[b]` — paired stat layout, big delta number, "share" CTA that copies the OG URL.
- New OG card route: `/cards/r/[code]/vs/[a]/[b]/[range].png` — head-to-head layout, rat-orange brand, "@token-rats — settle it" footer CTA, cached in R2 keyed by `(code, a, b, range, day)`.
- Add a "vs me" button on every other row of the room leaderboard.

**Why this and not the alternatives:** an auto-tweet recap needs an OAuth + posting pipeline we don't have. A demo/sandbox lowers conversion friction but doesn't create new shares. A VS Code source broadens audience but doesn't help the X loop. Head-to-head is the only one of the four that is **free distribution per existing user** and ships in a week with no new infra.

**Definition of done:** From any room leaderboard row, click "vs me" → land on the comparison → share button copies a URL whose OG card renders the matched stats. Both members must exist or the URL 404s. Card route returns 200 PNG at 1200×630 within 1s cold, sub-100ms cached.

---

### 🟩 Track Q — Bury the org plan (don't delete it)

**Owner:** Agent Q
**Inputs:** existing `/o` routes, Stripe webhook, org schema
**Outputs:** flagged-off org surface

- Add `NEXT_PUBLIC_ORG_PLAN_ENABLED=false` to web env; default false.
- Hide every `/o` link from logged-in nav, `/app` dashboard, footer, and onboarding.
- Keep `/o/*` routes mounted and reachable by direct URL (so existing tests and any internal use still work).
- Keep the Stripe webhook live — no harm, no removal.
- No schema change. The `orgs` and `org_members` tables stay. `mission.md`'s "architect for orgs, ship for individuals" principle is intact.

**Definition of done:** A brand-new logged-in user cannot reach any `/o` flow through normal UI navigation. Direct URLs (typed or shared in tests) still return 200. Flipping the flag back to `true` restores full visibility with no other code change.

---

### 🟩 Track R — Real Web Push payload encryption

**Owner:** Agent R
**Inputs:** `apps/api/src/lib/webpush.ts` (VAPID JWT correct, body empty)
**Outputs:** real RFC 8291 payload delivery

- Wire ECDH (P-256) + HKDF + AES-128-GCM per RFC 8291 in the existing `webpush.ts`. Use `crypto.subtle` from the Workers runtime — no Node-only crypto deps.
- Read VAPID keys from existing `VAPID_PRIVATE_KEY` / `NEXT_PUBLIC_VAPID_PUBLIC_KEY`. No new secrets.
- Unit-test the encryption helper against an RFC 8291 fixture (there are well-known test vectors).
- E2E: from `/settings/notifications`, "send test push" delivers a body that the existing service worker reads as `{ title, body, url }`.

**Definition of done:** A real test push from `/settings/notifications` shows the test title + body on Chrome desktop and Android Chrome (iOS Safari known-limited; document the limitation, don't try to fix it in v1.1). Unit tests cover the encryption math.

---

### 🟩 Track S — Email column + real provider

**Owner:** Agent S
**Inputs:** `users` table (no `email` column), `apps/api/src/lib/email.ts` (console-log stub), GitHub OAuth callback (already runs)
**Outputs:** users have emails, digests actually send

- New migration `0007_users_email.sql`: add `email TEXT` to `users`. No backfill in SQL.
- In the GitHub OAuth callback, on every login, fetch the user's primary verified email from the GitHub API and upsert it onto `users.email`.
- Replace the stub in `apps/api/src/lib/email.ts` with a Resend call using a new Worker secret `EMAIL_PROVIDER_API_KEY`. Plain HTML, no MJML, no template library — keep it 50 lines.
- Update the weekly digest cron path (`scheduled.ts` + `lib/digest.ts`) to actually call the new email helper.
- Add an unsubscribe link that hits `POST /v1/notifications/unsubscribe?token=<signed>` — sign the token with the existing session-signing key.
- Add a small `/settings/notifications` toggle for "weekly digest email" so users see and control it.

**Definition of done:** A signed-in user sees their email on `/settings`. The Monday cron, triggered locally via `wrangler dev --test-scheduled`, delivers a real email through Resend's sandbox. The unsubscribe link works.

---

### 🟩 Track T — Playwright smokes (close the web-side coverage gap)

**Owner:** Agent T
**Inputs:** existing `apps/web/app/` routes
**Outputs:** 6–7 Playwright tests in CI

- Add `@playwright/test` + `msw` to `apps/web`. Run against a stubbed Worker (msw), not the real one.
- Tests, in this order — stop if any fails to render:
  1. `/signin` → mock GitHub callback → land on `/app` with empty rooms list.
  2. `/app` → "Create room" → land on `/r/<code>` with empty leaderboard + own membership row.
  3. `/onboarding` after fresh sync renders the autobiography reveal without console errors.
  4. `/r/[code]/vs/[a]/[b]` (Track P) renders the comparison layout. Skip if Track P has not merged.
  5. OG cards return 200 PNG at correct dimensions: `/cards/room/[code]`, `/cards/u/[handle]`, `/cards/u/[handle]/weekly`, `/cards/u/[handle]/autobiography`, `/cards/trending/[range]`, and the new `/cards/r/[code]/vs/[a]/[b]/[range]` (skip if P pending).
  6. `/settings/notifications` enable browser push → "send test push" button shows a success toast.
  7. Public profile flow: toggle public on `/settings/profile`, hit `/u/<handle>` signed out → 200; toggle private → 404.
- Add a `playwright` job to `.github/workflows/ci.yml`, runs after `build`.

**Definition of done:** Playwright suite is green in CI, runs in under 90s total, and a deliberately broken card route turns the build red.

---

### 🟨 Phase 4 convergence (~half day)

Order the merge: Q (flag flip, smallest blast radius) → S (migration first, then provider) → R (encryption) → P (new card + route + contract) → T (Playwright, last, so it covers the new surface).

Smoke acceptance — one human walks this path on a fresh machine:
1. Sign in. See an empty `/app` with no `/o` link visible.
2. Sync. See yourself on `/r/<code>` and an autobiography on `/onboarding`.
3. Tap "vs me" against the room's #1 → land on `/r/<code>/vs/<me>/<them>` → share button copies a URL whose OG card renders the matchup.
4. Enable browser push on `/settings/notifications` → "test push" → receive a payload with real title + body.
5. Trigger the Monday digest cron locally → receive a real email in the Resend sandbox.
6. `pnpm test && pnpm --filter web exec playwright test` is all green.

**Phase 4 done when:** all five Track DoDs are met, the convergence smoke is clean, and the public-facing surface contains exactly zero references to the org plan.

---

## Parallelization summary

| Track | Touches contracts? | Touches DB? | Blocks anyone? |
|---|---|---|---|
| P — Head-to-head cards | **yes** (one schema add) | no | T (skip Track P assertions if not merged) |
| Q — Bury org plan | no | no | no |
| R — Web Push encryption | no | no | no |
| S — Email column + Resend | no | **yes** (0007 migration) | no |
| T — Playwright smokes | no | no | no (skip-on-absent for P) |

Merge gate: only Track P's contract addition needs to go in first. Everything else is independent and can land in any order.

Effort shape: roughly one week solo with agents pulling tracks Q, R, S, T in parallel while you (or a supervised agent) own Track P.

---

## Explicitly deferred to v1.2+

These came up in interview but are not v1.1. Decide based on what the first public X post reveals.

- **Demo / sandbox mode at `/demo`** — synthetic-data leaderboards so X visitors can see the product before installing. Pick this up if the head-to-head cards drive clicks but the CLI install converts poorly.
- **VS Code extension as a third source** — broadens audience beyond Claude Code + Cursor users. Pick this up if the addressable audience on X feels too narrow.
- **Auto-tweet weekly recap** — one-click post-to-X with the autobiography card. Needs X OAuth + posting pipeline; expensive. Pick this up only if v1.1 shows the share-card loop already works manually.
- **Animated PNG sequences for cards** — listed in Phase 2 Track I, never shipped. Revisit once we know which card format gets the most reshares.
- **Reviving the org plan publicly** — gated on consumer loop validation. Don't unflag until D7 retention is real.
- **iOS push** — known-broken in Safari. Out of scope. Document the limitation; don't chase it.

---

## Risks specific to v1.1

| Risk | Mitigation |
|---|---|
| Head-to-head card invites someone who isn't in the room → 404 looks broken | Card URL only renders for two confirmed room members; the "share" CTA wraps `?invite=<code>` so a non-member lands on the join page, not the 404. |
| VAPID encryption regression (silent push failure) | The unit test against RFC 8291 vectors is the hard gate. Plus the Playwright test 6 actually clicks "send test push". |
| Resend free tier or rate limit hits during a viral moment | Digest is weekly Monday, capped per user, and idempotent — re-running the cron can't double-send. No real-time email anywhere. |
| Playwright suite becomes flaky and gets ignored | Suite is small on purpose (6–7 tests). If a test goes flaky, fix it the same day or delete it; don't add a retry. |
| Hiding `/o` breaks an existing test that asserts visibility | Tests should import the feature flag, not assume visibility. Audit during Track Q. |

---

## What this roadmap deliberately does NOT do

- Does not chase a launch date. The X strategy is open-ended; v1.1 just makes the next post stronger.
- Does not add a sixth track for "marketing prep." That work happens outside this doc.
- Does not touch the proxy, real-time daemon, public profiles, or trending — they shipped, they work, they're not the bottleneck.
- Does not delete code, even the org plan code. Hidden ≠ removed.
- Does not change any v1 success metric. Same five from `mission.md`.
