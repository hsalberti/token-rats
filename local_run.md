 🏃 How to run locally
  
  Setup is already done (.dev.vars with your OAuth creds, .env.local, local D1 migrated). Two
  things first:

  1. Point your GitHub OAuth app at localhost

  In github.com/settings/developers → your OAuth app, the Authorization callback URL must be:
  http://localhost:8787/v1/auth/github/callback

  (Update both the dev app and the prod app, or maintain a separate dev OAuth app — your
  apps/api/.dev.vars GITHUB_CLIENT_ID/SECRET must match whichever app has the localhost
  callback.)

  2. Run the two dev servers in two terminals

  Terminal A — API Worker:
  cd ~/projects/token-rats/apps/api
  npx wrangler dev --local --persist-to .wrangler/state --port 8787

  Terminal B — Web:
  cd ~/projects/token-rats/apps/web
  npx next dev -p 3000
  
  ▎ You can also just run pnpm dev from the repo root (turbo runs both), but the two-terminal 
  ▎ split makes logs easier to read.

  3. Walk the 7-step golden path

  1. Sign in: open http://localhost:3000 → "Sign in with GitHub" → approve → land on /app with
  empty rooms list
  2. Create a room: click "Create room", name it (e.g. "test") → lands on /r/<code> showing your
  member entry, empty leaderboard
  3. CLI login (Terminal C):
  cd ~/projects/token-rats
  pnpm --filter token-rats dev login --api-url http://localhost:8787
  prints "Login complete"
  4. Sync (same terminal):
  pnpm --filter token-rats dev sync --api-url http://localhost:8787 --verbose
  4. You have real Claude Code logs in ~/.claude/projects/ — it should find them and print Synced
   N sessions (M new, K duplicates)
  5. See yourself: refresh http://localhost:3000/r/<code> — your handle ranks with real tokens +
  cost
  6. Share card: http://localhost:3000/cards/room/<code> — should download a 1200×630 PNG with
  your room name + podium

  If anything dies, look at:
  - Terminal A (wrangler) — auth, ingest, DB errors
  cd ~/projects/token-rats
  pnpm --filter token-rats dev login --api-url http://localhost:8787
  3. Browser opens to http://localhost:3000/cli?code=XXXX-XXXX → click "Approve" → terminal
  prints "Login complete"
  4. Sync (same terminal):
  pnpm --filter token-rats dev sync --api-url http://localhost:8787 --verbose
  4. You have real Claude Code logs in ~/.claude/projects/ — it should find them and print Synced
   N sessions (M new, K duplicates)
  5. See yourself: refresh http://localhost:3000/r/<code> — your handle ranks with real tokens +
  cost
  6. Share card: http://localhost:3000/cards/room/<code> — should download a 1200×630 PNG with
  your room name + podium

  If anything dies, look at:
  - Terminal A (wrangler) — auth, ingest, DB errors
  - Terminal B (next) — render errors
  - Browser console — client-side fetch errors

  Reset between runs

  # wipe local D1 + KV and re-apply migrations
  rm -rf apps/api/.wrangler/state
  cd apps/api && npx wrangler d1 migrations apply token-rats --local --persist-to .wrangler/state

  Known still-stubbed (don't expect these to work locally)

  - Web push (/settings/notifications → "send test push"): VAPID JWT is real but payload
  encryption is stubbed → push fires as the generic SW fallback only
  - Email digest (Monday 16:00 UTC cron): email.ts is console.log — no real delivery. To trigger
  locally: curl -X POST http://localhost:8787/__scheduled after starting with wrangler dev
  --test-scheduled
  - Stripe: no STRIPE_SECRET_KEY set, no customer create — org billing flow can't reach Stripe
  - Anthropic proxy: works if you POST a real key to /v1/proxy/keys/anthropic first, or uncomment
   ANTHROPIC_API_KEY in .dev.vars