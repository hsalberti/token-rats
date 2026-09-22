# Contributing

Read [the mission](mission.md) and [the counting method](docs/counting.md).
Help with parser fixtures, pricing coverage, source integrations, accessible
pages, and clear documentation. Enterprise work is paused.

Use Node 22 and pnpm 10. Copy the example configuration described in
[local_run.md](local_run.md), then run:

```sh
pnpm install --frozen-lockfile
pnpm db:migrate:local
pnpm dev
```

Before a pull request:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Add small synthetic fixtures for counting changes. Include repeated messages,
cache tokens, reasoning tokens, partial writes, and retry behavior when
relevant. Do not submit real conversation logs or credentials. New API
contracts belong in `packages/contracts`; SQL changes use a new migration.

Describe the problem, changed behavior, and validation. State known limits.
Do not claim a provider integration works until its collection path exists.
Share ideas and AGENTS.md examples on the community page. Use GitHub issues
for reproducible defects and feature proposals. Treat other contributors with
respect. Credit third-party work in NOTICES.md.
