# Token Rats

**An open source community for AI builders.** Track Claude Code, Codex, OpenCode, and Cursor usage, compare your subscriptions, and share agent workflows and AGENTS.md examples.

> Track usage. Share what works. Build in public.

- Live at **[tokenrats.com](https://tokenrats.com)** · API at `api.tokenrats.com`
- Try the local CLI without an account: `npx token-rats sync --dry-run`
- Built on Cloudflare end-to-end (Pages + Workers + D1 + R2 + KV + Durable Objects)

## Open source direction

The application, CLI, parsers, and project documents use the MIT license. Enterprise work is paused. Start with the [public documents](docs/README.md), [counting method](docs/counting.md), and [current release plan](docs/open-source-release.md).

- Public profiles: explicitly publish AGENTS.md files or excerpts and describe agent workflows.
- Community discussion: [r/TokenRats](https://www.reddit.com/r/TokenRats/), Alberti will create and manage the subreddit.
- `/app/compare`: monthly local usage and user-entered subscription amounts.
- `/sources`: local collector setup and counting details.

## How it works

1. **Sign in with GitHub** on the web app, optionally connect X/Twitter for your public handle.
2. **Install the CLI** (`npx token-rats login`) and run `token-rats sync` (one-shot) or `token-rats watch` (daemon).
3. The CLI reads local **Claude Code**, **Codex**, **OpenCode**, and **Cursor** usage fields, parses them into typed `SessionRecord`s, and uploads **counts only** — never prompts or completions.
4. The Worker dedupes, rolls into `daily_rollup`, and the web app draws leaderboards, streaks, challenges, share cards, and a live SSE feed.

The local CLI sends usage metadata only. Profile sharing publishes only the text you choose to share. See the [data boundaries](docs/counting.md#data-boundaries).

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
  parsers/      pure parsers: Claude Code, Codex, Cursor → SessionRecord[]
  cli/          `npx token-rats` — login, sync, watch, install-cursor, whoami, logout
infra/
  migrations/   D1 SQL migrations (0001 is frozen; later migrations add tables)
```

## Develop

Requires **Node ≥ 22.13** and **pnpm 10**.

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
token-rats sync            # one-shot upload of local Claude Code, Codex, OpenCode + Cursor usage
token-rats watch           # daemon mode — uploads as new sessions appear
token-rats install-cursor  # optional native SQLite speed-up for Cursor
token-rats whoami          # show the logged-in account
```

## Relaunch workspace

Release context, the posting schedule, and editable drafts live in [`traction/`](traction/README.md).

## Privacy

- We store **token counts, model and provider names, opaque session and device IDs, start/end timestamps, and computed cost** for usage records.
- The local tracker does not send prompts, completions, file paths, or tool output. Profiles display the instructions and workflows you choose to share.
- Rooms are private by default. Public profiles and global trending are opt-in.

## License & notices

Code and project documents are [MIT licensed](LICENSE). Third-party notices live in [`NOTICES.md`](./NOTICES.md).
