# @token-rats/taskbar

Cross-platform menu-bar / tray app for Token Rats. Stack: **Tauri 2.x** (Rust core)
+ React 19 + Vite + Tailwind for the webview.

This workspace ships the v1.2 scaffold of roadmap Track AH. See the **Status &
limitations** section for what is wired vs deferred.

## Layout

```
apps/taskbar/
├── package.json           # Node-side scripts + Vite/React deps
├── vite.config.ts         # Vite, fixed port 1420 (Tauri convention)
├── tsconfig.json          # extends repo tsconfig.base.json
├── index.html             # Vite entry
├── src/
│   ├── main.tsx           # React root
│   ├── App.tsx            # Auth ↔ Popover switcher
│   ├── Auth.tsx           # Device-code flow against /v1/auth/cli/*
│   ├── Popover.tsx        # Main tray UI
│   ├── styles.css         # Tailwind directives
│   └── lib/
│       ├── api.ts         # Thin browser fetch client
│       └── token-store.ts # Persists token via @tauri-apps/plugin-store
└── src-tauri/             # Rust crate
    ├── Cargo.toml
    ├── build.rs
    ├── tauri.conf.json
    ├── capabilities/default.json
    ├── icons/             # placeholder emerald PNGs (replace before ship)
    └── src/
        ├── main.rs        # delegates to lib::run()
        └── lib.rs         # tray + menu + window + sync_now command
```

## Environment variables

| Variable        | Where              | Default                          | Purpose                                                 |
| --------------- | ------------------ | -------------------------------- | ------------------------------------------------------- |
| `VITE_API_URL`  | webview (build)    | `https://api.tokenrats.com`      | Token Rats API base. Override for staging/local dev.    |
| `TAURI_DEV_HOST`| Tauri CLI (dev)    | unset                            | Optional: bind dev server to a LAN IP (mobile workflow).|
| `TAURI_DEBUG`   | Vite build         | unset                            | When set, disables minify + emits sourcemaps.           |

For local dev against `apps/api` running on Wrangler, prefix the dev command:

```bash
VITE_API_URL=http://localhost:8787 pnpm --filter @token-rats/taskbar tauri:dev
```

## Scripts

```bash
pnpm --filter @token-rats/taskbar dev          # vite only (webview without Tauri shell)
pnpm --filter @token-rats/taskbar tauri:dev    # full Tauri dev (requires Rust toolchain)
pnpm --filter @token-rats/taskbar build        # vite production build (->dist)
pnpm --filter @token-rats/taskbar tauri:build  # full Tauri bundle (mac/win/linux)
pnpm --filter @token-rats/taskbar typecheck    # tsc --noEmit
```

Rust-only checks:

```bash
cd apps/taskbar/src-tauri && cargo check
```

## Auth flow

Mirrors `packages/cli/src/commands/login.ts`:

1. `Auth.tsx` calls `POST /v1/auth/cli/exchange` and receives a verification URL +
   `pollToken`.
2. The verification URL is opened in the user's default browser via
   `tauri-plugin-opener`.
3. The webview polls `POST /v1/auth/cli/poll` every 2s until the response carries a
   token (`200`) or expires (`410`).
4. The token is persisted via `@tauri-apps/plugin-store`.

## Token storage choice (v1.2 ADR)

We use **`tauri-plugin-store`** (a JSON file in
`app_data_dir()/auth.json`). It avoids the keychain-prompt friction during the
first run and works identically on macOS, Windows, and Linux.

**v1.3 plan:** migrate to the OS keychain via the `keyring` crate (macOS Keychain /
Windows Credential Manager / libsecret). The ADR is captured at the top of
`src/lib/token-store.ts`.

## Status & limitations (v1.2)

Wired:

- Tray icon + tray menu (Open, Sync now, Open dashboard, Quit).
- Popover window — frameless, hidden by default, toggles on left-click.
- Hide-on-close (the X button hides the window; quit is explicit via tray).
- Device-code auth flow end-to-end against the existing API.
- Popover UI: avatar, handle, today's $ + tokens (placeholder), streak
  (placeholder), top-room rank (placeholder), Sync now button, Sign out, Open
  dashboard.
- Auto-launch plugin enabled (Rust side) — UI toggle deferred.

Stubbed / deferred to v1.3:

- **Real "Sync now"** path: the Rust `sync_now` command currently returns a
  placeholder string. Plumbing `@token-rats/parsers` + filesystem access from the
  Tauri shell is non-trivial because the parser package targets Node. v1.3
  options: (a) shell out to the installed `token-rats` CLI binary, or (b) port
  the parser entry to a Rust + native-bindings stack.
- **SSE live updates** for the popover. The roadmap calls for live spend within
  5s of an ingest; current popover shows placeholder values. The plumbing point
  is `Popover.tsx` — add a hook on `EventSource` against
  `/v1/rooms/:code/live` once a "me-live" endpoint exists or the subscriptions
  are scoped per-user.
- **Native notifications** ("you got passed", "room milestone"). Requires SSE
  wiring above.
- **Auto-launch UI**: setting page with a toggle.
- **Signed installers**: macOS notarization + Windows code-signing. v1.2 ships
  unsigned; CI is `continue-on-error: true` for the bundle job.
- **Distribution**: `tokenrats/tap` and winget package not yet created.
- **OS keychain** for tokens — see token-storage ADR above.

## Contracts

No new contract types. The taskbar reuses `ENDPOINTS.authCliExchange`,
`ENDPOINTS.authCliPoll`, `ENDPOINTS.me`, and `ENDPOINTS.sessions` from
`@token-rats/contracts`.

## CI

`.github/workflows/ci.yml` builds the taskbar on `macos-14` and `windows-2022`
matrices. The job is `continue-on-error: true` while code-signing is missing.
Artifacts are uploaded but not auto-released.
