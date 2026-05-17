# Token Rats — Tech Stack

The stack is chosen to (a) ship the fastest viral loop, (b) be cheap-to-free at 1k–10k users, (c) survive a HN front page without paging anyone, and (d) carve clean interfaces so multiple agents can work on different subsystems in parallel.

## Surfaces and where they run

| Surface | Tech | Hosting | Purpose |
|---|---|---|---|
| **Marketing site + PWA** | Next.js 15 (App Router), React Server Components, Tailwind, shadcn/ui | Cloudflare Pages | Landing, sign-in, rooms, leaderboards, profile, share-card OG routes |
| **API** | Cloudflare Workers (TypeScript, Hono router) | Cloudflare Workers | Auth, ingest, leaderboard queries, room management |
| **Database** | Cloudflare D1 (SQLite at the edge) | Cloudflare | Users, rooms, memberships, sessions, daily rollups |
| **Object store** | Cloudflare R2 | Cloudflare | Pre-rendered share cards, future avatar uploads |
| **Cache / counters** | Cloudflare KV + Durable Objects | Cloudflare | Live leaderboard counters (Phase 2), rate limits |
| **CLI** | TypeScript, distributed via npm as `token-rats` | npm | Reads local Claude Code + Cursor logs, uploads counts |
| **Auth** | GitHub OAuth (server-side, via Worker) | Cloudflare | Single auth provider in v1 |
| **OG / share cards** | `@vercel/og` (Satori) in a Next.js route | Cloudflare Pages | Dynamic PNG cards for X / Discord embeds |

## Repo layout (monorepo, pnpm workspaces, Turbo)

```
token-rats/
├── apps/
│   ├── web/            # Next.js App Router PWA + marketing
│   └── api/            # Cloudflare Worker (Hono)
├── packages/
│   ├── cli/            # `npx token-rats` source readers + uploader
│   ├── contracts/      # Zod schemas + TypeScript types shared across api/web/cli
│   ├── pricing/        # model → $/token catalog (JSON + helpers)
│   ├── parsers/        # Pure functions: Claude Code log → SessionRecord[], Cursor cache → SessionRecord[]
│   └── ui/             # Shared React components / Tailwind preset (optional, split later if needed)
├── infra/
│   ├── wrangler.toml   # Worker + D1 + KV + R2 bindings
│   └── migrations/     # D1 SQL migrations
├── mission.md
├── tech-stack.md
└── roadmap.md
```

**Why a monorepo:** `packages/contracts` is the single source of truth for API request/response shapes. Web, API, and CLI all import it. Breaking the contract breaks the build everywhere — exactly what we want when agents are working on different tracks.

## Interface contracts (these unblock parallel agent work)

Once these are written and merged, every other track is independent.

### 1. `packages/contracts` — the API surface

Zod schemas + inferred TS types for:
- `SessionRecord` — `{ id, source: "claude-code" | "cursor", model, inputTokens, outputTokens, costUsd, startedAt, endedAt }`
- `UploadSessionsRequest` / `UploadSessionsResponse`
- `Room`, `RoomMembership`, `LeaderboardRow`, `Profile`
- All endpoints typed as `RouteSpec<Req, Res>` so the Worker handler and the web client can't drift.

### 2. `packages/parsers` — pure functions

Each parser is a pure function `(input: Buffer | string) → SessionRecord[]`. No I/O, no network. The CLI is just glue that locates files on disk, calls the parser, and posts to the API.

This means: the parser agent and the CLI plumbing agent can work in parallel. The parser agent only needs example log fixtures.

### 3. `packages/pricing` — static JSON

`{ "claude-3-5-sonnet-20241022": { "inputPerMTok": 3, "outputPerMTok": 15 }, ... }`

Updated by hand or by a scraper later. Everything else (CLI, API, web) imports a `priceOf(model, inTok, outTok)` helper.

### 4. D1 schema — frozen in `infra/migrations/0001_init.sql` before tracks start

```sql
users        (id, github_id, handle, avatar_url, created_at)
orgs         (id, name, created_at)                          -- empty in v1; reserved for org plan
org_members  (org_id, user_id, role)
rooms        (id, code, name, owner_id, org_id NULLABLE, created_at)
room_members (room_id, user_id, joined_at)
sessions     (id, user_id, source, model, in_tokens, out_tokens, cost_usd_cents, started_at, ended_at, dedupe_key)
daily_rollup (user_id, day, tokens, cost_usd_cents, sessions)  -- one row per user per day, leaderboard reads this
```

Notes:
- `org_id` on rooms is nullable in v1 but present, so the org plan slots in without a migration.
- `dedupe_key` on sessions = hash of `(source, started_at, model, in_tokens, out_tokens)` to make re-syncs idempotent.
- `daily_rollup` is the only table leaderboard queries hit. Writes go through a small upsert in the Worker.

### 5. Worker API endpoints (locked in `packages/contracts`)

```
POST   /v1/auth/github/callback        (OAuth)
GET    /v1/me
POST   /v1/sessions                    (CLI uploads SessionRecord[])
POST   /v1/rooms                       (create)
POST   /v1/rooms/:code/join
GET    /v1/rooms/:code/leaderboard?range=today|7d|30d
GET    /v1/cards/room/:code.png        (share card OG; redirects to Pages route)
```

Anything not in this list is out of scope for v1.

## Why Cloudflare end-to-end

- **Pages + Workers + D1 + R2 + KV** = one provider, one billing line, one deploy story.
- **D1 (SQLite)** handles our v1 load comfortably; HN-front-page traffic is mostly reads against `daily_rollup` which is tiny and cacheable.
- **Workers cold start ~0ms** = global feel without picking regions.
- **Free tier covers us to ~5–10k DAU** for everything except R2 egress (negligible — share cards are small PNGs).
- If we outgrow D1, we move `sessions` to a managed Postgres (Neon) and keep `daily_rollup` in D1 as read cache. Migration path is well-trodden.

## Scale plan (only what we'll actually need)

| Bottleneck | When it hurts | What we do |
|---|---|---|
| `sessions` row count grows | ~10M rows | Roll old sessions into rollups, delete raw rows > 90 days for free tier |
| Leaderboard query latency | Big rooms or global board | Pre-aggregate into `daily_rollup`; cache room leaderboards in KV with 60s TTL |
| Share-card CPU | Going viral | Cache rendered PNGs in R2 keyed by room+day; regenerate on background trigger |
| Real-time feel | Once we have rooms with >20 active people | Add Durable Object per room as a fan-out hub for SSE; CLI streams instead of batches |
| Abuse / fake data | Only if it becomes a problem | Add light validation: pricing-table hash check, rate limits per user |

## Conventions

- **TypeScript strict everywhere.** No `any`. `unknown` at boundaries, narrowed by Zod.
- **Zod at every boundary.** API request bodies, parser outputs, env vars.
- **No ORMs in v1.** Raw SQL against D1 via the Workers binding. Small surface, fast.
- **Tests:** Vitest unit tests for parsers and pricing math (they're pure — easy to fixture). Playwright smoke test for sign-in → create room → see leaderboard. No more than that in v1.
- **Lint/format:** Biome (one tool, fast).
- **CI:** GitHub Actions — typecheck, lint, test, build. Deploy on green push to `main`.
- **Secrets:** `wrangler secret`, `.dev.vars` locally. Never in the repo.

## What we explicitly DON'T pick (and why)

- **Postgres / Supabase** — overkill for v1; adds a region + a vendor. Reconsider if/when org plan ships.
- **Clerk / Auth0** — GitHub OAuth in a Worker is ~80 lines; no need to pay for it.
- **Prisma / Drizzle** — D1's binding is fine; ORMs add weight and cold-start. Revisit if schema gets gnarly.
- **Redis** — KV + Durable Objects cover everything we'd reach for Redis for.
- **React Native / Expo** — PWA ships this week; native ships never if the loop doesn't validate.
