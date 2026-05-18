# Testing-First Roadmap — what to verify before declaring v1 ready

This branch landed Phase 0 → Phase 3 of `roadmap.md` in 20 commits across ~124 source files. Automated tests cover the pure / well-bounded parts; the social, browser, and provider-integration paths still need manual verification. This document is the **single checklist a human (or another agent) walks through before turning the deploy key**.

> Run order: §1 (automated) → §2 (golden path manual) → §3 (per-track manual) → §4 (deploy preflight). Block on §4 — those are the production-only gaps.

---

## 1. Automated tests — what passes today

```
pnpm install
pnpm typecheck   # all 6 packages, 0 errors
pnpm test        # 98 tests across 11 files
```

| Package | File | What it proves |
|---|---|---|
| `pricing` | `index.test.ts` (3) | exact pricing, prefix-matching for date-suffixed models, unknown-model fallback |
| `parsers` | `parsers.test.ts` (38) | Claude Code aggregation across sessions, cache+input/output token math, malformed-line tolerance, Cursor model-name mapping, deterministic dedupe keys |
| `cli` | `api-retry.test.ts` (8) | retry/backoff matrix: 5xx, 408, 429, network errors retry; 400/401 don't; exhausted retries surface |
| `api` | `auth.test.ts` (10) | HMAC sign/verify, expiry, tampered signature, malformed payloads |
| `api` | `rate-limit.test.ts` (3) | per-user allow/block, sliding window |
| `api` | `sessions.test.ts` (5) | UTC day-bucketing math, rollup grouping |
| `api` | `streaks.test.ts` (10) | streak SQL math: current vs longest, multi-day gaps |
| `api` | `me.test.ts` (11) | PATCH /v1/me validation: handle/bio/twitter length, public-toggle |
| `api` | `stripe.test.ts` (5) | webhook HMAC signature: valid, tampered, wrong secret, missing header |
| `api` | `ingest.test.ts` (5) | `recordSession` helper: insert path, dedupe path, rollup upsert |

### What's NOT covered by automated tests

Add these before declaring confidence in the API surface. Each item is small (1–3 tests):

- [ ] `rooms.ts` — create, join, get, leave, rename happy paths + permission errors
- [ ] `leaderboard.ts` — SQL aggregation per range (`today`, `7d`, `30d`, `all`)
- [ ] `profiles.ts` — public/private 404 logic, autobiography aggregation
- [ ] `trending.ts` — ban-list filter, public-only filter, KV cache hit/miss
- [ ] `challenges.ts` — create / list / winner-computation
- [ ] `push.ts` — subscribe upsert, delete-all, test endpoint returns ok
- [ ] `notifications.ts` — pref upsert is idempotent
- [ ] `digest.ts` (lib) — empty-week edge case, big-week aggregation
- [ ] `proxy.ts` — key encrypt/decrypt round-trip, streaming usage parsing of a synthetic `message_delta` SSE stream, fallback to env key
- [ ] `room-live-hub.ts` — DO subscriber set, fanout to multiple clients, disconnect cleanup
- [ ] `live.ts` — membership gate, SSE proxy to DO
- [ ] `orgs.ts` — create + slug uniqueness, invite accept via github_login
- [ ] `stripe-webhook.ts` — `customer.subscription.created/updated/deleted` reconciliation paths
- [ ] `abuse.ts` — report writes a row, banlist KV lookup blocks /trending

### Web-side automation gap

There's **no Playwright or other E2E** in this branch. At minimum we need:

- [ ] `signin → /app` flow against a fake API (Playwright + msw)
- [ ] Create a room → join via second user → see leaderboard
- [ ] Onboarding autobiography reveal renders without error
- [ ] OG card routes for `/cards/room/[code]`, `/cards/u/[handle]`, `/cards/u/[handle]/weekly`, `/cards/u/[handle]/autobiography`, `/cards/trending/[range]` — all return 200 PNG of the right size

---

## 2. Golden-path manual smoke test (10 minutes)

This is the demo. If this works end-to-end, the loop is alive.

1. `pnpm dev` (turbo dev — runs Worker + Next.js side by side).
2. **Sign in.** Click "Sign in with GitHub" on `localhost:3000`. Land on `/app` with empty rooms list.
3. **Create a room.** Click "Create room", name it. Land on `/r/<code>` with empty leaderboard + your member entry.
4. **Authenticate the CLI.** In a second terminal, `pnpm --filter token-rats dev login --api-url http://localhost:8787`. Browser opens to `/cli?code=XXXX-XXXX`. Approve. Terminal continues.
5. **Sync.** `pnpm --filter token-rats dev sync --api-url http://localhost:8787 --verbose`. Should discover Claude Code logs and upload, printing `Synced N sessions (M new, K duplicates)`.
6. **See yourself.** Refresh `/r/<code>` — your handle should be ranked #1 with real tokens + $.
7. **Share card.** Visit `/cards/room/<code>` directly — should return a 1200×630 PNG with your room name + top-3.

Pass criterion: all 7 steps succeed without console errors in the browser or Worker.

---

## 3. Per-track smoke tests

### Phase 1 — Vertical slice
- [ ] **Parsers (A):** drop a real `.jsonl` into `packages/parsers/src/__fixtures__/` and add it to the test suite; verify the totals match what Claude Code's own UI reports.
- [ ] **CLI (B):** test `sync` on macOS, Linux, Windows. Verify `--dry-run` prints without uploading. Verify `logout` removes `~/.config/token-rats/token`.
- [ ] **API (C):** hit `/healthz`. Run a Bruno/Postman collection against every `/v1/*` endpoint and verify 401s vs 200s.
- [ ] **Web (D):** every route renders without console errors on mobile width (375px) and desktop. All client buttons (copy, share, range toggle) work.

### Phase 2 — Virality
- [ ] **Rooms polish (G):** rename a room as owner — non-owner gets 403. Leave a room as non-owner — works. As owner — 403 with "delete the room" hint.
- [ ] **Streaks (H):** check streak math against a hand-rolled fixture (3 consecutive days = streak of 3; one missed day breaks it).
- [ ] **Challenges (H):** create a "most-tokens" challenge — its winner SQL returns the same answer as the leaderboard for the challenge window.
- [ ] **Onboarding (J):** visit `/onboarding` after a fresh sync. Animations reveal step-by-step. "Share my autobiography" link copies a working URL. The OG card at `/cards/u/<handle>/autobiography` renders with the right stats.
- [ ] **Share cards v2 (I):** podium layout on the room card matches the top-3 in the leaderboard. Brand color is rat-orange, not Tailwind default orange.
- [ ] **Web push (K):** in the browser, visit `/settings/notifications` → enable browser push → click "send test push". Notification should appear within 5s. **Will only work after VAPID payload encryption is wired (see §4).**
- [ ] **Email digest (K):** invoke the cron handler locally with `wrangler dev --test-scheduled` + `curl http://localhost:8787/__scheduled`. The digest builder should log the per-user HTML payload. **Will only deliver after a real email provider is wired (see §4).**

### Phase 3 — Scale + monetization
- [ ] **Real-time (L):** open two browser tabs on `/r/<code>`. Run `pnpm cli watch` in a third terminal. Touch a file in your Claude Code logs directory. Both tabs should refresh the leaderboard within ~2 seconds, and one should show a "new burn from @you" toast.
- [ ] **Anthropic proxy (M):** with a real Anthropic key set via `/proxy`, run a `curl` to `localhost:8787/v1/proxy/anthropic/v1/messages` with a tiny prompt + `stream: true`. The SSE stream should proxy through transparently. Check that a new session row appears in D1 with the right token counts and `source = 'claude-code'`.
- [ ] **Public profiles (N):** toggle `/settings/profile` to public → set bio + Twitter. Sign out, hit `/u/<handle>` — see public profile. Toggle back to private — same URL now 404s.
- [ ] **Trending (N):** with at least 5 public users having data, visit `/trending`. Top-10 should be ordered correctly. KV cache: refresh within 5 minutes returns the same `generatedAt`.
- [ ] **Org plan (O):** `/o/new` creates an org. Invite a second GitHub login. Sign in as that user — `/o/<slug>/accept` flow works. `/o/<slug>/dashboard` shows aggregated spend across both users.
- [ ] **Stripe webhook (O):** use `stripe trigger customer.subscription.created` against the local Worker. `orgs.plan` flips to `pro`. `seat_count` matches the subscription quantity.

---

## 4. Deploy preflight — block on these

These are real-world gaps that won't show up in any test. They MUST be addressed before exposing the deploy to friends, let alone HN.

### Provider integrations that are stubbed today
1. **Web Push payload encryption.** `apps/api/src/lib/webpush.ts` signs VAPID JWTs correctly but sends an empty body. To deliver actual payloads, wire ECDH key agreement + HKDF + AES-128-GCM per RFC 8291. Until then, push notifications fire as "ping" with the generic SW fallback message.
2. **Email delivery.** `apps/api/src/lib/email.ts` is a console-log stub. Wire Resend or Postmark and store an `EMAIL_PROVIDER_API_KEY` Worker secret. **Also: the `users` table has no `email` column** — add a migration before sending real emails.
3. **Stripe customer create.** `POST /v1/orgs` does NOT create a Stripe customer. Wire the customer-create fetch and persist `stripe_customer_id`. Without this, the `/o/<slug>/billing` link to `STRIPE_PORTAL_URL` has nothing to point at.
4. **Stripe API key** — set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` as Worker secrets.
5. **Anthropic API key** — either users supply their own via `/proxy`, or set the `ANTHROPIC_API_KEY` Worker secret as a fallback.
6. **VAPID keys** — generate a P-256 keypair, store private as `VAPID_PRIVATE_KEY` Worker secret, expose public as `NEXT_PUBLIC_VAPID_PUBLIC_KEY` in the web env.

### Cloudflare config that needs real IDs
- Replace `REPLACE_WITH_D1_ID` in `apps/api/wrangler.toml` with the production D1 database ID.
- Replace `REPLACE_WITH_KV_ID` with the KV namespace ID.
- Create the `token-rats-cards` R2 bucket.
- Verify the Durable Object migration (`v2` adds `RoomLiveHub`) runs cleanly on first deploy.

### GitHub OAuth app
- Create a GitHub OAuth app with callback URL `https://api.tokenrats.com/v1/auth/github/callback`.
- Set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` as Worker secrets.

### Schema migrations
- Run `wrangler d1 migrations apply token-rats --remote` to apply 0001 → 0006 in order. **One known gap**: there's no `users.email` column yet — add it before email delivery ships.

### Hosting
- Cloudflare Pages for `apps/web/` with `NEXT_PUBLIC_API_URL=https://api.tokenrats.com` and `NEXT_PUBLIC_VAPID_PUBLIC_KEY=<...>`.
- Set up the `tokenrats.com` and `api.tokenrats.com` custom domains.
- Confirm `__Host-tr_session` cookie scoping works across the two subdomains (CORS allows `tokenrats.com`, cookie uses `__Host-` prefix → Path=/; Secure; same-origin only). **This is the most likely deploy-day bug** — test it end-to-end against staging before pointing DNS.

### Privacy + security checks
- [ ] CLI is published to npm under the `token-rats` name (claim it now even if you don't publish).
- [ ] `packages/parsers/` is link-able from the landing page so users can read the source.
- [ ] No prompt or completion content appears in any log or DB query — grep `sessions.ts`, `proxy.ts`, and `digest.ts` for any `body`, `content`, `prompt`, `completion` reference.
- [ ] CORS is restricted to `WEB_ORIGIN` only — confirm in the deployed Worker.
- [ ] Rate limits are tuned: 60/min for `/v1/sessions` is fine, but `/v1/auth/cli/exchange` should be tighter (5/min/IP) to avoid abuse.

---

## 5. Definition of "v1 ready to launch"

Strict gate:
1. §1 automated tests all pass.
2. §2 golden path completes in 10 minutes on a fresh machine.
3. §3 per-track checklist is at least 75% green.
4. §4 deploy preflight items 1–6, Cloudflare config, GitHub OAuth, and migrations are all done.
5. A 2-person friend room has been live for 24 hours with both users syncing.

If any of those fail, do NOT post to HN.
