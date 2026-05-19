# Token Rats

**Strava for AI token burn.** Auto-syncs your Claude Code + Cursor token usage to a leaderboard with your friends, your room, and the world.

> Gym rats, for token tracking.

- Live at **[tokenrats.com](https://tokenrats.com)** · API at `api.tokenrats.com`
- CLI on npm: `npx token-rats login && npx token-rats sync`
- Built on Cloudflare end-to-end (Pages + Workers + D1 + R2 + KV + Durable Objects)

## How it works

1. **Sign in with GitHub** on the web app, optionally connect X/Twitter for your public handle.
2. **Install the CLI** (`npx token-rats login`) and run `token-rats sync` (one-shot) or `token-rats watch` (daemon).
3. The CLI reads your local **Claude Code** and **Cursor** logs, parses them into typed `SessionRecord`s, and uploads **counts only** — never prompts, never completions.
4. The Worker dedupes, rolls into `daily_rollup`, and the web app draws leaderboards, streaks, challenges, share cards, and a live SSE feed.

The hard rule (see [`mission.md`](./mission.md)): **prompt and completion text never leave your machine.** The CLI is open-source so you can read the parser before it touches your disk.

## Specs

- [`mission.md`](./mission.md) — why we're building this, who it's for, success metrics
- [`tech-stack.md`](./tech-stack.md) — Cloudflare + Next.js + TypeScript monorepo, interface contracts
- [`roadmap.md`](./roadmap.md) — what's shipped and what's next
- [`CLAUDE.md`](./CLAUDE.md) — working notes for Claude Code agents on this repo

## Layout

```
apps/
  api/          Cloudflare Worker (Hono) — auth, ingest, leaderboards, SSE, Stripe
  web/          Next.js 15 PWA — rooms, profiles, orgs, share cards, dashboard
packages/
  contracts/    Zod schemas + TS types shared across web/api/cli (load-bearing)
  parsers/      pure parsers: Claude Code + Cursor logs → SessionRecord[]
  cli/          `npx token-rats` — login, sync, watch, install-cursor, whoami, logout
infra/
  migrations/   D1 SQL migrations (0001 is frozen; later migrations add tables)
```

## Develop

Requires **Node ≥ 20** and **pnpm 10**.

```bash
pnpm install
pnpm db:migrate:local   # apply D1 migrations to .wrangler — required on fresh clone
pnpm dev                # turbo dev — api (wrangler) + web (next), in parallel
pnpm lint               # biome check .
pnpm typecheck          # tsc across all workspaces
pnpm test               # vitest across api + packages
pnpm build              # production build
```

Single-package work:

```bash
pnpm --filter @token-rats/api dev          # wrangler dev only
pnpm --filter @token-rats/web dev          # next dev only
pnpm --filter @token-rats/parsers test     # one package's vitest suite
```

CI runs `lint → typecheck → test → build` (`.github/workflows/ci.yml`). Match that order locally before pushing. Full local-run notes live in [`local_run.md`](./local_run.md).

## CLI quickstart

```bash
npm i -g token-rats        # or just: npx token-rats <cmd>
token-rats login           # opens browser, drops a token into ~/.config/token-rats
token-rats sync            # one-shot upload of new Claude Code + Cursor sessions
token-rats watch           # daemon mode — uploads as new sessions appear
token-rats install-cursor  # adds the Cursor log-export hook on this machine
token-rats whoami          # show the logged-in account
```

## Privacy

- We store **token counts, model name, start/end timestamps, and computed cost** — nothing else from your sessions.
- No prompt, completion, file path, or tool output is ever sent. Parsing happens fully on your machine.
- Rooms are private by default. Public profiles and global trending are opt-in.

## License & notices

Third-party notices live in [`NOTICES.md`](./NOTICES.md).
