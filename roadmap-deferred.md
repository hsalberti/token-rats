# Roadmap — Deferred from PR #9 / v1.2

> Created 2026-05-19 while integrating PR #9 (v1.2 mega-PR, 19k LOC, 159 files).
> PR #9 was too large to safely merge whole onto a main with an audience, so a
> small additive bundle was cherry-picked (friends, Twitter OAuth backend,
> primary-source helpers, roadmap doc). The tracks below are the rest of v1.2 —
> deferred, not killed. The code already exists on PR #9's branch
> (`claude/review-roadmap-progress-KvPM6`) if any of these come back.

## What landed (for context)

- ✅ **Track AC — Twitter/X OAuth (backend only)** — routes, migration `0008_users_twitter.sql`, env vars. UI Connect button **NOT** wired yet (see `roadmap-v1.2.md`).
- ✅ **Track AD — Friends** — `/v1/me/friends` route + `/app/friends` page. Done.
- ✅ **Track AF — Primary-source pill (helpers only)** — `lib/primary-source.ts` and the `PrimarySourcePill` component exist. Server-side compute on leaderboard / profile / card responses **NOT** wired.
- ✅ Roadmap doc `roadmap-v1.2.md`.

## What's deferred

Each entry: track letter, scope, why deferred, where the code lives.

### Track Y — Heatmaps + room stat strip
- New `/v1/heatmap?scope=user|room` unified endpoint. New `RoomStatStrip`, `RoomHeatmap`, `Heatmap` components. New `room-summary` + `group-streak` routes.
- **Deferred because:** modifies `/u/[handle]/page.tsx`, `/r/[code]/RoomView.tsx`, and the card routes — high conflict surface against the share-recap + referral changes that just landed.
- **Branch:** `claude/review-roadmap-progress-KvPM6`, commits `0748895` → `d9862b7`.
- **Migration:** needed columns are in PR #9's `0007_orgs_pending.sql` (renumber to 0009 since 0007 is `referrals` and 0008 is `users_twitter`).

### Track AA — Org waitlist (soft-create) + admin queue
- `POST /v1/orgs` flips orgs to `status='pending'` instead of activating. New `/v1/admin/orgs/pending` + approve. `/v1/waitlists` endpoint. New `/o/[slug]/pending` founder edit page. New `/waitlist/companies` and `/waitlist/provider` forms. `ADMIN_HANDLES` env gate.
- **Deferred because:** changes the existing org creation flow (paid plan path). Wants its own focused PR with retention thinking — soft-create framing is product-sensitive.
- **Branch:** same, commits `5cbfccd` + `14b2666`.
- **Migrations:** `0007_orgs_pending.sql`, `0008_waitlists.sql`, `0009_users_email.sql` (renumber to 0010, 0011, 0012).

### Track AE — Public country-locked groups
- New `/v1/groups` endpoint with `cf-ipcountry` filter. `is_public=1` + `country` on rooms. New `/groups` landing + `JoinGroupButton`. Modifies `DashboardClient` (public-room checkbox).
- **Deferred because:** entangled with `DashboardClient` referral changes; needs UX review of the country-mismatch 403 path.
- **Branch:** same, commit `1dd49bc`.
- **Migration:** `0011_rooms_public.sql` (renumber to 0013).

### Track AF (UI wiring) — Primary-source pill on cards / profile / leaderboard
- Helpers + component shipped. What's deferred: server-side compute on `Profile`, `LeaderboardRow`, autobiography stats; rendering on `/u/[handle]`, room leaderboard, share cards, trending.
- **Deferred because:** touches every card route (`cards/u/...`, `cards/room/...`, `cards/trending/...`) which have heavy formatting churn.
- **Branch:** same, commits `5459d17` + `390cef8`.

### Track Z — Trending homepage promotion
- Replace signed-out `/` (marketing copy) with live trending leaderboard + slim hero.
- **Deferred because:** the current landing page just got the "@hsalberti credit" + audience-friendly copy. Replacing wholesale needs a deliberate decision, not an accidental side-effect of a mega-merge.
- **Branch:** same, commit `1dd49bc` (homepage diff) + `5459d17` (KV cache).

### Track AH — Tauri taskbar app
- New `apps/taskbar/` — Tauri 2.x + React + Vite. ~24 new files including Rust source, Cargo.lock, icons, tauri.conf.json.
- **Deferred because:** new build target with native-tooling dependencies (Rust toolchain, platform code-signing). Doesn't belong in the same PR as web changes. Should be its own repo or its own ship-of-its-own.
- **Branch:** same, commits `b867bbf` + `979895a` (CI taskbar).

### Track AI — Playwright e2e suite
- 10 spec files (`apps/web/e2e/*.spec.ts`), `playwright.config.ts`, MSW fixtures, CI workflow changes.
- **Deferred because:** new test infrastructure with its own dependency tree (`@playwright/test`, MSW) and CI shape change. Pair this with a "real" e2e initiative, not stowed into v1.2.
- **Branch:** same, commits `78087eb` + `919a354`.

## How to revive any of these

The branch `claude/review-roadmap-progress-KvPM6` is preserved (PR #9 closed, not deleted). For each track:

1. `git checkout -b feat/<track-name> origin/main`
2. `git checkout claude/review-roadmap-progress-KvPM6 -- <new-files-for-track>`
3. Surgical edits to existing files (route registration, contracts exports)
4. Renumber migrations (next available number is 0009 after this commit lands)
5. Open a focused PR

Or open a fresh AI-authored PR against current main if the original is too stale.
