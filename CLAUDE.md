# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Run from the repo root unless noted. Package manager is **pnpm 10**; Node ≥ 22.13.

```
pnpm install
pnpm db:migrate:local # apply D1 migrations to the local .wrangler state — required after a fresh clone, otherwise the API 500s on "no such table: users"
pnpm dev              # turbo dev — runs apps/api (wrangler) + apps/web (next) in parallel
pnpm lint             # biome check .
pnpm format           # biome format --write .
pnpm typecheck        # turbo run typecheck across all workspaces
pnpm test             # turbo run test (Vitest in api + each package)
pnpm build            # turbo run build
```

Single-package work:

```
pnpm --filter @token-rats/api dev          # wrangler dev only
pnpm --filter @token-rats/web dev          # next dev only
pnpm --filter @token-rats/parsers test     # one package's Vitest suite
pnpm --filter @token-rats/api test -- -t "name"   # one test by name
pnpm --filter @token-rats/api exec wrangler d1 migrations apply token-rats --local
```

CI runs `lint → typecheck → test → build` (`.github/workflows/ci.yml`). Match that order locally before pushing.

## Architecture

Token Rats is a Cloudflare-native monorepo: a Next.js PWA, a Hono Worker API, and an npm-distributed CLI, all wired together through a shared contracts package. The mission/tech-stack rationale lives in `mission.md` and `tech-stack.md`; read those if a decision feels arbitrary.

**Data flow.** The CLI (`packages/cli`) reads local Claude Code, Codex, OpenCode, and Cursor usage fields from disk. Claude Code and Codex use JSONL parsers, Cursor uses its local cache, and OpenCode uses the read-only SQLite query in `packages/cli/src/lib/opencode-extract.ts`. The CLI `POST`s a `SessionRecord[]` to `/v1/sessions` on the Worker (`apps/api`). The Worker dedupes via `sessions.dedupe_key`, upserts into `daily_rollup`, and the web app reads leaderboards off that rollup. Usage metadata only flows through this pipeline; full profile instructions are public only after explicit publication.

**The contract package is load-bearing.** `packages/contracts` exports Zod schemas + inferred TS types for every API request/response, plus the domain types (`SessionRecord`, `Room`, `LeaderboardRow`, etc.). The Worker validates inbound payloads against these schemas; the web client and CLI import the same types. Changing a contract breaks the build everywhere on purpose — that's the cross-workspace safety net. When adding an endpoint, define its schema in `contracts` first, then implement the route handler and the client call.

**Pricing is server-authoritative and time-versioned.** Costs live in D1 — `models_catalog` (one row per known model) and `model_price_snapshots` (one row per model-day, carry-forward semantics: a session is priced at the most recent snapshot with `day <= session.day`). The async `priceOf(env, model, dayIso, inTok, outTok)` helper at `apps/api/src/lib/pricing.ts` does exact-match first, then longest-prefix on the family (so `claude-opus-4-7-20260101` resolves to `claude-opus-4-7`). Unknown models get logged with `source='session-inferred'` to drive roadmap discovery. The daily cron `0 4 * * *` (`apps/api/src/lib/price-refresh.ts`) refreshes the catalog from OpenRouter `/api/v1/models`. Parsers and CLI emit `costUsdCents: 0` — the server overwrites at ingest. Admin `POST /v1/admin/prices/recompute` re-stamps historical sessions and rebuilds rollups.

**API surface (`apps/api/src`).** Hono app in `index.ts` mounts route modules from `routes/` under `/v1/*`. Today's mount map:

- `/v1/auth` (GitHub OAuth) and `/v1/auth/twitter/*` + `/v1/me/twitter/disconnect` (Twitter/X OAuth, mounted as `/v1` so it can register both prefixes)
- `/v1/me` (identity) — `friends.ts` is mounted on the same namespace so the path is `/v1/me/friends`
- `/v1/sessions` (CLI ingest)
- `/v1/rooms` plus the per-room sub-routes for `leaderboard`, `streaks`, `challenges`, `live` (SSE)
- `/v1/r` (`room-aggregates` — public room summary, heatmap, group streak)
- `/v1/groups` (public country-locked group discovery)
- `/v1/u` (public profiles)
- `/v1/push`, `/v1/notifications`
- `/v1/trending`, `/v1/abuse`, `/v1/orgs`, `/v1/admin` (project-owner only, gated by `ADMIN_GITHUB_LOGIN`)
- `/webhooks/stripe`
- `GET /healthz`

Cross-cutting logic (auth helpers, ingest dedupe, primary-source resolution, rate limiting, Stripe, web push, weekly digest, referrals, email) lives in `lib/`. The cookie-based auth middleware is in `middleware/auth.ts` and sets `AuthVariables` on the Hono context. The `RoomLiveHub` Durable Object (re-exported from `index.ts`, source in `lib/room-live-hub.ts`) is the SSE fan-out for live room updates. `scheduled.ts` runs from the `0 16 * * 1` cron in `wrangler.toml` for weekly digests.

**Worker bindings (`apps/api/wrangler.toml`).** `DB` (D1), `CACHE` (KV), `CARDS` (R2), `ROOM_LIVE` (Durable Object). `WEB_ORIGIN` sets the web origin. Secrets — `GITHUB_CLIENT_ID/SECRET`, `SESSION_SIGNING_KEY`, `VAPID_PRIVATE_KEY/PUBLIC_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, Twitter/X OAuth secrets, and `ADMIN_GITHUB_LOGIN` — use Wrangler secrets and `.dev.vars` locally. The root `infra/wrangler.toml` is reference-only; the deployable config is `apps/api/wrangler.toml`.

**D1 migrations.** SQL files in `infra/migrations/` (referenced by `migrations_dir = "../../infra/migrations"`). `0001_init.sql` is frozen. Add new migrations as numbered files; don't edit existing ones. Migration `0025` adds explicit full-instruction publication and workflow descriptions to profiles. Community navigation goes to r/TokenRats; the built-in forum routes are retired. The retired proxy key tables are removed only with `infra/manual/retire_proxy_keys.sql` after the new API is deployed, because CI applies normal migrations before deploying the Worker.

**Web app (`apps/web/app`).** Next.js 15 App Router + React 19 + Tailwind. Top-level route segments include rooms (`r/`), public profiles (`u/`), `community`, `sources`, `signin`, `settings`, `onboarding`, `trending`, `cli`, `join`, `cards`, `groups`, `changelog`, `admin`, and the authed dashboard at `app/`. Shared client helpers (`lib/api.ts`, `lib/auth.ts`, `lib/use-room-live.ts`, etc.) wrap fetch calls and the SSE live hook.

**CLI (`packages/cli`).** Entry at `src/index.ts` dispatches commands in `src/commands/` (`login`, `sync`, `watch`, `whoami`, `logout`, `install-cursor`). `sync`/`watch` discover Claude Code, Codex, OpenCode, and Cursor data locally and upload usage metadata to the API. `install-cursor` is an optional native SQLite speed-up. The CLI is published as the `token-rats` binary via `bin` in its package.json; its build (`build.mjs`) is a separate esbuild step, not part of Turbo.

## Conventions

- **TypeScript strict everywhere.** `tsconfig.base.json` enables `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`. No `any` (Biome warns). `unknown` at boundaries, narrowed with Zod.
- **Zod at every boundary** — API request bodies, parser outputs, env config. Domain shapes live in `packages/contracts`.
- **No ORM.** Raw SQL via the D1 binding. Keep queries close to the route handler.
- **Imports use `.js` extensions** in TS source (ESM + `verbatimModuleSyntax`); the contracts/parsers/pricing packages export `./src/index.ts` directly with no build step, so workspace consumers compile straight from source.
- **Biome** is the single linter+formatter (2-space indent, 100-col, double quotes, trailing commas, semicolons). Don't add ESLint/Prettier.
- **Tests** are Vitest unit tests, kept next to source (`*.test.ts`) or under `__tests__/` in the CLI. Parsers + pricing math are pure — fixture them aggressively (`packages/parsers/src/__fixtures__/`).
