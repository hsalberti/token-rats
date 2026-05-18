# Token Rats — Worker API

Cloudflare Worker (Hono router) serving all `/v1` endpoints for Token Rats.

## OAuth Setup

### 1. Create a GitHub OAuth App

Go to **GitHub → Settings → Developer settings → OAuth Apps → New OAuth App** and fill in:

| Field | Value |
|---|---|
| Application name | Token Rats (dev) |
| Homepage URL | `https://tokenrats.dev` (or your dev URL) |
| Authorization callback URL | `https://<your-worker-domain>/v1/auth/github/callback` |

Note down the **Client ID** and generate a **Client Secret**.

### 2. Set Wrangler Secrets

```bash
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put SESSION_SIGNING_KEY   # any long random string, e.g. openssl rand -hex 32
```

### 3. Local Development

Create `apps/api/.dev.vars` (gitignored):

```
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
SESSION_SIGNING_KEY=your_random_signing_key
WEB_ORIGIN=http://localhost:3000
```

Then run:

```bash
pnpm --filter @token-rats/api dev
```

### 4. D1 + KV Bindings

Replace placeholder IDs in `wrangler.toml`:

```bash
# Create D1 database
wrangler d1 create token-rats
# note the database_id and paste into wrangler.toml

# Create KV namespace
wrangler kv:namespace create CACHE
# note the id and paste into wrangler.toml

# Run migrations
wrangler d1 migrations apply token-rats
```

## Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/healthz` | — | Health check |
| GET | `/v1/auth/github/start` | — | Start GitHub OAuth browser flow |
| GET | `/v1/auth/github/callback` | — | GitHub OAuth callback |
| POST | `/v1/auth/cli/exchange` | — | Mint CLI device code |
| POST | `/v1/auth/cli/approve` | cookie | Approve CLI device code |
| POST | `/v1/auth/cli/poll` | — | Poll for CLI token |
| GET | `/v1/me` | required | Authenticated user info |
| POST | `/v1/sessions` | required | Ingest session records (idempotent) |
| POST | `/v1/rooms` | required | Create a room |
| POST | `/v1/rooms/:code/join` | required | Join a room |
| GET | `/v1/rooms/:code` | required (member) | Get room + members |
| GET | `/v1/rooms/:code/leaderboard` | required (member) | Get leaderboard |
| GET | `/v1/u/:handle` | optional | Get public profile |

## Auth Flow

**Browser (web app):**
1. User visits `/v1/auth/github/start` → redirected to GitHub.
2. GitHub redirects back to `/v1/auth/github/callback?code=...&state=...`.
3. Worker exchanges code, upserts user, sets `__Host-tr_session` cookie, redirects to `/app`.

**CLI device-code flow:**
1. CLI calls `POST /v1/auth/cli/exchange` → gets `verificationUrl` + `pollToken`.
2. User opens `verificationUrl` in browser, signs in with GitHub, approves via `POST /v1/auth/cli/approve`.
3. CLI polls `POST /v1/auth/cli/poll` until it gets a bearer token (200) or times out (410).
