# Token Rats — Roadmap

The roadmap is built around **parallel tracks**. Each track has an owner (a human or an agent), a hard interface contract, and a definition of done. Tracks inside a phase are independent — they can run concurrently across multiple agents without merge conflicts as long as they respect the contracts defined in Phase 0.

Legend:
- 🟦 **Sequential** — must be done before the next thing starts.
- 🟩 **Parallel** — can run alongside other 🟩 tracks in the same phase. Spawn one agent per track.
- 🟨 **Convergence** — a short serial step where parallel tracks merge.

---

## Phase 0 — Foundations (🟦 sequential, ~1 day)

The goal of Phase 0 is to **freeze the interfaces** so Phase 1 can fan out across agents without anyone blocking anyone else.

1. Initialize monorepo (`pnpm`, Turbo, Biome, TypeScript strict, Vitest).
2. Land `packages/contracts` with Zod schemas for `SessionRecord`, `Room`, `LeaderboardRow`, `Profile`, and every endpoint in the API spec (see `tech-stack.md`).
3. Land `packages/pricing` with a seeded JSON for the current Claude + GPT model lineup and a `priceOf()` helper.
4. Land `infra/migrations/0001_init.sql` with the full v1 schema (frozen — schema changes in Phase 1 require a Phase 0 ammendment).
5. Land `apps/api` skeleton: Hono on a Worker, D1 binding, healthcheck route only.
6. Land `apps/web` skeleton: Next.js on Pages, empty homepage.
7. Set up GitHub OAuth app + Cloudflare account + `wrangler.toml` bindings.
8. CI: typecheck + lint + test + build on push.

**Definition of done:** A push to `main` deploys a "Hello, Rats" page to `tokenrats.com` and a `/healthz` Worker route. Contracts and migrations are merged. No track in Phase 1 needs to modify Phase 0 outputs.

---

## Phase 1 — Vertical slice (🟩 6 parallel tracks, ~1 week)

After Phase 0, six tracks can run **concurrently**. Each can be assigned to its own agent.

### 🟩 Track A — Parsers (pure, fixture-driven)

**Owner:** Agent A
**Inputs needed from Phase 0:** `packages/contracts` (`SessionRecord`)
**Outputs:** `packages/parsers/claude-code.ts`, `packages/parsers/cursor.ts`

- Collect 3–5 real log/cache fixtures for Claude Code (`~/.claude/projects/**/*.jsonl`) and Cursor (sqlite cache).
- Write pure parser functions: `parseClaudeCode(buf) → SessionRecord[]`, `parseCursor(buf) → SessionRecord[]`.
- Use `packages/pricing` to fill in `costUsd`.
- 100% unit-tested with fixtures. Zero I/O.

**Definition of done:** Both parsers pass a Vitest suite. No file I/O in the parser package itself.

### 🟩 Track B — CLI (`npx token-rats`)

**Owner:** Agent B
**Inputs needed from Phase 0:** `packages/contracts`. **Mocks** the parsers from Track A.
**Outputs:** `packages/cli` published to npm as `token-rats`.

- Commands: `token-rats login` (device-code-style GitHub OAuth via the API), `token-rats sync`, `token-rats whoami`.
- Locates Claude Code + Cursor data dirs across macOS / Linux / Windows.
- Calls parsers (Track A) once they land; until then uses a fixture parser.
- Uploads to `POST /v1/sessions` in batches of 500 with retries and exponential backoff.
- Idempotent via `dedupe_key`.

**Definition of done:** `npx token-rats sync` works against a staging Worker with a stub parser, and against real logs once Track A merges.

### 🟩 Track C — Worker API

**Owner:** Agent C
**Inputs needed from Phase 0:** `packages/contracts`, D1 schema, Hono skeleton.
**Outputs:** Implementation of every endpoint in `tech-stack.md`.

- GitHub OAuth callback + session cookie (HMAC-signed JWT in `__Host-` cookie).
- `POST /v1/sessions` writes to `sessions` + upserts `daily_rollup` atomically.
- `POST /v1/rooms`, `POST /v1/rooms/:code/join`.
- `GET /v1/rooms/:code/leaderboard?range=...` reads only `daily_rollup`.
- Rate limit per user via KV.

**Definition of done:** Postman/Bruno collection passes against deployed staging Worker. Endpoints typed end-to-end via `packages/contracts`.

### 🟩 Track D — Web PWA

**Owner:** Agent D
**Inputs needed from Phase 0:** `packages/contracts`, web skeleton.
**Outputs:** All v1 routes in `apps/web`.

- `/` landing with one-liner + "Sign in with GitHub" + `npx token-rats` copy-paste install.
- `/app` after sign-in: list of rooms, "Create room", "Join with code".
- `/r/[code]` room leaderboard with today / 7d / 30d toggle.
- `/u/[handle]` minimal profile (this week, this month, all-time).
- PWA manifest, mobile-first Tailwind, dark mode, big touch targets.
- Calls Worker API via typed client generated from `packages/contracts`.

**Definition of done:** End-to-end flow (sign-in → create room → see leaderboard with seeded data) works on mobile Safari and Chrome.

### 🟩 Track E — Share cards

**Owner:** Agent E
**Inputs needed from Phase 0:** `packages/contracts` (just needs `LeaderboardRow` shape).
**Outputs:** OG image routes in `apps/web` + `<meta>` tags.

- `apps/web/app/cards/room/[code]/route.tsx` returns a dynamic PNG using `@vercel/og`.
- Designs: weekly winner, personal weekly receipt, room standings.
- Each room/profile/leaderboard page emits proper `og:image` meta so X/Discord previews are clean.
- Cache rendered cards in R2 keyed by `(scope, day)`.

**Definition of done:** Pasting a `tokenrats.com/r/<code>` link into X shows a designed leaderboard card.

### 🟩 Track F — Pricing catalog + scraper

**Owner:** Agent F (small, can be folded into another track if needed)
**Inputs needed from Phase 0:** `packages/pricing` skeleton.
**Outputs:** Up-to-date `prices.json` covering all live Claude + GPT models.

- Manually entered for v1; a tiny scrape-and-PR script can land later.
- Helper `priceOf(model, inTok, outTok) → number` with sane fallback (zero if unknown, never throw).

**Definition of done:** Every model that appears in the parser fixtures has a price entry. Unknown models log a warning, don't crash.

### 🟨 Phase 1 convergence (~half day)

Tracks A → B (parsers wired into CLI), C ↔ B (CLI uploads against real Worker), C ↔ D (web reads real leaderboards). Smoke: a Vibe Coder runs `npx token-rats sync`, sees their numbers on the leaderboard from their phone within 30 seconds.

**Phase 1 done when:** one user can sync from their Mac and see themselves on a leaderboard on their phone. That's the entire core loop.

---

## Phase 2 — Virality (🟩 5 parallel tracks, ~1 week)

Now we make it spread. These five tracks can run in parallel because they touch mostly disjoint files. Anything that needs a contract change has to go back through Phase 0.

### 🟩 Track G — Friends, invites, room polish

- Invite links that pre-fill the room code.
- Room avatars / names / colors.
- "Recent activity" feed inside a room.
- Mute / leave room.

### 🟩 Track H — Streaks + challenges

- Daily streak counter per user per room.
- Weekly challenge: "biggest single-session burn", "most consistent", "longest streak".
- Auto-generated weekly recap card pushed to every room member's profile.

### 🟩 Track I — Share-card v2

- Personal "Token Rat of the Week" cards.
- Animated PNG sequences (3-frame) for higher CTR on X.
- "Tag your room" CTA at the bottom of every card.

### 🟩 Track J — Onboarding magic moment

- On first sync, run a small "your token autobiography" page: best day, dominant model, total $ burned, fun stats.
- Auto-prompt to share it. **This is the single biggest viral lever — invest disproportionately here.**

### 🟩 Track K — Web push + email digests

- Web Push API: "You got passed on the weekly board" / "Your room's challenge ends in 6 hours."
- Weekly Monday email digest (Resend or Postmark) — one per room.

### 🟨 Phase 2 convergence

A user installing today should: sync → see autobiography → share it → drag in 2 friends → join challenges → get pinged when they fall behind. Measure the funnel; cut anything that doesn't move it.

---

## Phase 3 — Scale, sources, money (🟩 4 parallel tracks, ~2 weeks)

Phase 3 only starts if Phase 1+2 hit the v1 success metrics in `mission.md`.

### 🟩 Track L — Real-time daemon mode

- CLI gets `token-rats watch` — long-running, posts per session end.
- Worker emits SSE per room via Durable Objects.
- Leaderboard updates live without refresh.

### 🟩 Track M — API proxy mode

- For raw-API users: point `ANTHROPIC_BASE_URL` at `proxy.tokenrats.com/<userkey>`.
- Worker forwards to Anthropic, logs counts, never persists prompt content.
- Requires careful trust copy ("we forward your traffic and log counts only — open source, audit it").

### 🟩 Track N — Public profiles + global discovery

- Opt-in public profiles at `/u/<handle>`.
- Global "top burners this week" page.
- Trending share cards.
- Light moderation pipeline (handle-banlist, report button).

### 🟩 Track O — Org plan (paid)

- `orgs` and `org_members` tables (already in schema since Phase 0).
- Org dashboard: spend by user, spend by repo (Cursor exposes this), spend by model.
- GitHub-org-based auto-invite.
- Stripe billing, ~$5/user/mo or flat tier.

---

## Parallelization summary

| Phase | Tracks runnable in parallel | Best for solo + agents? |
|---|---|---|
| 0 | 1 (sequential) | Do this yourself, fast. Don't delegate. |
| 1 | **6** | Spawn 6 agents in parallel. They will not collide if Phase 0 is locked. |
| 2 | **5** | Spawn 5 agents. Track J (onboarding) is the most important — supervise it personally. |
| 3 | **4** | Spawn 4 agents. Track M (proxy) needs the most trust/copy review by you. |

**Operational rule:** Anything that requires a `packages/contracts` change has to be merged sequentially. Everything else can fan out.

## Risks and what we'll do about them

| Risk | Mitigation |
|---|---|
| Claude Code or Cursor changes their log format | Parsers are pure + fixture-tested; bumping is mechanical. CLI ships with a version + warns on unknown formats. |
| Anthropic / OpenAI add their own usage UI before we get traction | Our edge is the **friend graph**, not the numbers. Keep social, share cards, and rooms ahead of features. |
| HN front page → D1 melts | `daily_rollup` is tiny + cacheable in KV; leaderboard reads stay sub-50ms even under load. |
| Privacy backlash (someone screenshots their friend's burn shaming them) | Default-private rooms + counts-only data + clear copy in onboarding. Public profiles are opt-in. |
| Solo founder gets overwhelmed | Roadmap is intentionally tracked-and-trackable; agents do tracks, you do Phase 0 and convergence. |

## What we're explicitly deferring

- Native apps (iOS / Android)
- Anti-cheat / verification
- Multi-provider org SSO (Google Workspace, Okta)
- VS Code extension as a source (Cursor cache covers most of it)
- Integrations with Anthropic Console export / OpenAI billing CSV
- Anything that requires Anthropic or OpenAI to ship something for us
