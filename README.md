# Token Rats

Strava for AI token burn. Auto-syncs your Claude Code + Cursor token usage to a leaderboard with your friends.

> Gym rats for token tracking with friends.

## Specs

- [`mission.md`](./mission.md) — why we're building this, who it's for, success metrics
- [`tech-stack.md`](./tech-stack.md) — Cloudflare + Next.js + TypeScript monorepo, interface contracts
- [`roadmap.md`](./roadmap.md) — Phase 0 → Phase 3, parallel-track delivery

## Layout

```
apps/
  api/               Cloudflare Worker (Hono) — auth, ingest, leaderboards
  web/               Next.js PWA — landing, rooms, profiles, share cards
packages/
  contracts/         Zod schemas + TS types shared across web/api/cli
  pricing/           model → $/token catalog + priceOf() helper
  parsers/           pure parsers: Claude Code + Cursor logs → SessionRecord[]
  cli/               `npx token-rats` — reads local logs, uploads counts
infra/
  migrations/        D1 SQL migrations (0001_init.sql frozen at Phase 0)
  wrangler.toml      shared Cloudflare bindings reference
```

## Develop

```
pnpm install
pnpm dev          # turbo dev (api + web)
pnpm typecheck
pnpm test
pnpm build
```

## License

MIT
