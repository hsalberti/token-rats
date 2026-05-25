# Local testing playbook — multi-device + daemon

Tested-before-merge guide for the three features landing on branch `worktree-roadmap-multi-device`:

1. **Multi-device aggregation regression test** (`vmarcial`)
2. **Anonymized device list + remote disconnect** (`/app/devices`, server stores no hostname / OS)
3. **Daemonized watcher** (`token-rats install-daemon` + heartbeat + live indicator)

The whole pass takes ~15 minutes. Stop at the first red step and report back.

## 0 — Prep

```sh
# from the repo root, on the worktree
git status                            # should show the branch's diff staged for commit
pnpm install                          # idempotent — installs the workspace
pnpm db:migrate:local                 # applies 0017_devices.sql to the local D1
pnpm lint && pnpm typecheck           # already green on the worktree; re-verify locally
pnpm test                             # 125 API tests including the new multi-device regression
pnpm build                            # full workspace build
```

CI parity: that's the same `lint → typecheck → test → build` ordering as `.github/workflows/ci.yml`.

## 1 — Verify the vmarcial regression test catches the contract

```sh
pnpm --filter @token-rats/api test -- -t "multi-device"
```

Expected: the `multi-device: two sessions for the same user with different device_ids…` test passes. If you want to *see* it fail in a future regression, temporarily flip the assertion in `apps/api/src/lib/ingest.test.ts` to `.not.toBe(true)` and confirm the test goes red. Revert before committing.

Read `notes/2026-05-25-multi-device-audit.md` for the diagnostic ladder that should run any time a user reports the symptom in production. Nothing in the code path was *changed* to fix vmarcial — see the audit note for why.

## 2 — End-to-end multi-device walkthrough (local)

Two terminals + a browser.

### 2a. Boot the stack

```sh
# Terminal A
pnpm dev
```

Expect: Wrangler dev on `http://localhost:8787` and Next on `http://localhost:3000`.

### 2b. Sign in once in the browser

Open `http://localhost:3000/signin` → complete GitHub OAuth against your local Worker. Land on `/app`.

### 2c. Build + link the CLI for direct invocation

```sh
# Terminal B
pnpm --filter token-rats build
NODE=$(pwd)/packages/cli/dist/index.js
node "$NODE" --version          # → 0.0.5
```

### 2d. Pretend to be PC #1

```sh
# Simulate a fresh "PC #1" install — wipe the per-install state so a new
# device_id is generated. Repeat at the bottom for "PC #2".
export XDG_CONFIG_HOME=$(mktemp -d)/pc1
node "$NODE" login --api-url http://localhost:8787 --no-daemon
# (complete the browser approval — the CLI prints the URL and a code)
node "$NODE" whoami --api-url http://localhost:8787
# → Signed in as @your-handle
# → Device id: <UUID-1>
node "$NODE" sync --api-url http://localhost:8787 --verbose
```

If you don't have local Claude Code logs handy, drop a fixture:

```sh
mkdir -p "$HOME/.claude/projects/local-test"
cat > "$HOME/.claude/projects/local-test/$(uuidgen).jsonl" <<'JSONL'
{"type":"user","sessionId":"pc1-fixture-001","timestamp":"2026-05-25T10:00:00Z"}
{"type":"assistant","sessionId":"pc1-fixture-001","timestamp":"2026-05-25T10:00:01Z","message":{"role":"assistant","model":"claude-sonnet-4-6","usage":{"input_tokens":1234,"output_tokens":567,"cache_read_input_tokens":0,"cache_creation_input_tokens":0}}}
JSONL
node "$NODE" sync --api-url http://localhost:8787 --verbose
```

Expect: "Synced 1 sessions" and a green `Uploaded 1 session(s)` log.

### 2e. Pretend to be PC #2 (same GitHub user, separate XDG dir)

```sh
export XDG_CONFIG_HOME=$(mktemp -d)/pc2
node "$NODE" login --api-url http://localhost:8787 --no-daemon
node "$NODE" whoami --api-url http://localhost:8787
# Note the different Device id printed
# Then sync with a different fixture session id ('pc2-fixture-001').
```

### 2f. Confirm aggregation in the browser

Open `http://localhost:3000/app/devices`. Expect:

- Two devices listed.
- Each device's 30d totals are non-zero and **sum** to your global 30d total visible on `/app` and `/u/<handle>`.
- No hostname / OS / machine-name strings rendered anywhere (verify in the DOM and `wrangler tail`).

Check the DB directly to be paranoid:

```sh
pnpm --filter @token-rats/api exec wrangler d1 execute token-rats --local \
  --command "SELECT device_id, COUNT(*) FROM sessions WHERE user_id = '<your-user-id>' GROUP BY device_id;"
```

Expect two rows with distinct `device_id`s. Both rows present = aggregation contract holds.

### 2g. Disconnect-from-web flow

In the browser, on `/app/devices`, click **Disconnect** on the PC #1 row. Confirm the prompt.

```sh
# back in Terminal B with XDG_CONFIG_HOME=$(mktemp -d)/pc1 re-exported
node "$NODE" sync --api-url http://localhost:8787 --verbose
```

Expect: the CLI prints "This device was disconnected from the Token Rats web UI." and exits 1. Re-running `node "$NODE" login --api-url http://localhost:8787 --no-daemon` clears the sentinel and lets sync work again. The disconnected device shows in `/app/devices` with a "Disconnected" pill — its historical totals stay.

## 3 — Daemon install + live indicator (macOS / Linux only — Windows has no local Wrangler harness for the watcher)

```sh
# Use a real XDG dir so the launchd / systemd unit can point to the same node binary
unset XDG_CONFIG_HOME
node "$NODE" login --api-url http://localhost:8787   # this installs the daemon
node "$NODE" daemon-status                            # → "running"
```

On macOS: `launchctl list | grep com.tokenrats.watch`. On Linux: `systemctl --user status token-rats-watch`. Either should show the process running.

Hit `/app/devices` in the browser within ~60s — your current device should show a green pulse and a recent heartbeat time. Kill the process:

```sh
# macOS
launchctl bootout gui/$UID/com.tokenrats.watch
# Linux
systemctl --user stop token-rats-watch.service
```

Wait 5 minutes and refresh `/app/devices` — the dot goes gray. Reinstall:

```sh
node "$NODE" install-daemon
```

Within 60s the dot is green again. Verify rotation detection by truncating one of the local JSONL files (`: > "$HOME/.claude/projects/.../<file>.jsonl"`) — `~/Library/Logs/token-rats/watch.err.log` (macOS) or `journalctl --user -u token-rats-watch` (Linux) should show a "Rotation detected" warning.

Clean up when done:

```sh
node "$NODE" uninstall-daemon
node "$NODE" logout
```

## 4 — Privacy audit

Pre-merge sanity check that no identifying metadata is on the server:

```sh
pnpm --filter @token-rats/api exec wrangler d1 execute token-rats --local \
  --command ".schema devices"
```

The output must list **only** `device_id, user_id, created_at, last_seen_at, last_heartbeat_at, last_upload_count, cli_version, revoked_at`. No `hostname`, no `os`, no `label`.

```sh
grep -i "hostname\|os_name\|machine" apps/api/src
```

Should return nothing.

## 5 — What "ready to merge" looks like

- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` all green on the worktree.
- Step 2f shows two devices summing to the global total.
- Step 2g revokes correctly and a `token-rats login` re-enables.
- Step 3 (daemon) flips green within 60s on a working install and gray within 5 min on a stopped install.
- Step 4 shows no PII-shaped columns or strings.

If all five gates pass, the branch is ready. Push the worktree branch and open the PR. **Do not merge to `main` from this script** — `main` is prod; merge in your usual flow after a final eyeball.

## Known limitations / followups

- Step 3 (daemon) cannot fully test on Windows without booting a Windows host — the `schtasks` integration is best verified on a Windows install via `token-rats install-daemon` + Task Scheduler. The other layers (heartbeat, revoke) are the same as macOS/Linux.
- The `/v1/me/devices/heartbeat` route currently returns 404 if the device hasn't uploaded a session yet. The CLI's first heartbeat may race the first sessions upload that creates the row; this is benign (subsequent heartbeats succeed). If you see "heartbeat failed" in `--verbose` immediately after `install-daemon`, that's expected and resolves itself on the second tick.
- `vmarcial`'s actual production case is *not* fixed by this PR. The diagnostic ladder in `notes/2026-05-25-multi-device-audit.md` is the triage path; the device-list UI makes the most-likely root causes self-diagnose for users.
