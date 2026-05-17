# Token Rats — Mission

## What we're building

**Token Rats is Strava for AI token burn.** A social leaderboard that auto-syncs your Claude Code and Cursor token usage and ranks you against your friends, your room, and — eventually — the world.

One line: *gym rats for token tracking with friends*.

## Why now

"Tokenmaxxing" is already a meme:

- **Meta's "Claudeonomics" board** ranked 85k employees by token consumption. Leadership took it down because people were deliberately burning compute to climb it.
- **Shopify and Microsoft** run internal leaderboards to celebrate top token spenders as a cultural ritual.
- **Tokscale.ai, `ccusage`, Claude-Code-Usage-Monitor** all let you stare at your own number — none of them have a social graph.

There is no consumer product that turns this behavior into a friend graph. The wedge is open while the meme is hot.

## Who it's for

**Primary persona — Vibe Coder.** Builds in Cursor and/or Claude Code. Lives in dev Twitter and a couple of Discords (Cursor, Claude, indie hackers). Ships fast, brags about tooling, sees token burn as flex not cost.

**Secondary persona (post-v1) — Engineering orgs.** Want a sanctioned, internal Claudeonomics for their teams. Pay for SSO, private orgs, and spend analytics.

## Success criteria for v1

| Metric | Target (first 30 days post-launch) |
|---|---|
| Sign-ups | 1,000 |
| % of signed-up users in a room with ≥1 friend | ≥40% (friend-graph activation) |
| D7 leaderboard retention | ≥20% |
| Share cards posted publicly | ≥1 per active user per week |
| Sync sources working in the wild | Claude Code + Cursor |

If we hit these, we earn the right to build orgs, public profiles, and real-time mode. If we don't, we go back to the loop.

## Principles

1. **Counts only.** We never see prompts or completions. "We literally can't read what you typed" is the privacy posture, baked into the schema from day one.
2. **CLI is open-source.** Devs need to be able to read the parser before they let it touch their disk. The CLI is the trust anchor.
3. **Private rooms by default.** v1 is a friend-graph product. Public profiles and global trending come *after* we earn the network.
4. **Every screen is screenshot-worthy.** If a user wouldn't post it to X, we built the wrong screen. Share cards are first-class, not an afterthought.
5. **Boring, fast stack.** Cloudflare-native end-to-end, Next.js, TypeScript everywhere. We win on the social loop, not on infra taste.
6. **Architect for orgs, ship for individuals.** Schema, auth, and IDs allow an org plan to bolt on without a migration.
7. **Solo + agents friendly.** Every subsystem has a hard interface so multiple agents can work on tracks in parallel without colliding.

## Non-goals for v1

- Native iOS / Android apps (PWA is enough)
- API-proxy mode for raw-API users (Phase 3)
- Real-time streaming (daily sync is fine to start)
- Anti-cheat (the meme self-polices; fakers out themselves)
- Storing any prompt or completion content
- Anything that requires Anthropic or OpenAI to ship a feature for us
- Paid features (architected for, not built)
