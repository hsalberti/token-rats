# Run Token Rats locally

Use Node 22 and pnpm 10. No production account or enterprise plan is needed.
Cloudflare Wrangler runs the Worker, SQLite/D1, KV, and other bindings locally.

## Configure

```sh
pnpm install --frozen-lockfile
cp apps/api/.dev.vars.example apps/api/.dev.vars
cp apps/web/.env.example apps/web/.env.local
```

Create a separate development GitHub OAuth app. Set its home URL to
`http://localhost:3000` and callback to
`http://localhost:8787/v1/auth/github/callback`. Put its client ID and secret
in `apps/api/.dev.vars`. Set SESSION_SIGNING_KEY to a random value, and set
ADMIN_GITHUB_LOGIN to your GitHub login to use local admin tools. Do not commit
these local configuration files.

## Start

```sh
pnpm db:migrate:local
pnpm dev
```

Open `http://localhost:3000`. Sign in with GitHub. New accounts can create
rooms, publish community posts, and compare local usage.

The CLI can run from source without installing a background service:

```sh
pnpm --filter token-rats dev login --api-url http://localhost:8787 --no-daemon
pnpm --filter token-rats dev sync --api-url http://localhost:8787 --dry-run
pnpm --filter token-rats dev sync --api-url http://localhost:8787
pnpm --filter token-rats dev watch --api-url http://localhost:8787
```

For an installed service, build the CLI first:

```sh
pnpm --filter token-rats build
node packages/cli/dist/index.js install-daemon --api-url http://localhost:8787
```

The daemon stores a runtime copy under your Token Rats configuration directory.
Run install-daemon again after you build a new version. The API and web servers
must also be running for local uploads to succeed.

## Check the features

- `/community`: publish an idea or AGENTS.md, reply, download, and delete.
- `/app/compare`: select a month and enter a subscription amount.
- `/proxy`: add your own API key for optional provider requests.
- `/app/devices`: check the tracker heartbeat.

Provider API calls use your provider account and can incur charges. Unit tests
mock those calls. Email, push, and production deployment need their own
bindings and secrets; they are not needed for the core local flow.

## Verify changes

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Tests use synthetic records and temporary in-memory databases. See
[the release plan](docs/open-source-release.md) for the isolated browser tests
and deployment order. Existing development databases receive migrations on
`pnpm db:migrate:local`; do not delete their state as a routine setup step.

To host your own instance, copy the Wrangler configuration and replace the
Cloudflare resource IDs, domain routes, WEB_ORIGIN, and OAuth credentials with
your own. The checked-in production IDs are not usable deployment defaults
for another Cloudflare account.
