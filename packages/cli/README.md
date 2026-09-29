# token-rats

> Track local agent usage and share your evolving global instructions with friends on Token Rats.

## Install

```bash
npx token-rats login   # one-time auth
npx token-rats sync    # upload your usage
```

Or install globally:

```bash
npm install -g token-rats
token-rats sync
```

## Commands

| Command | Description |
|---|---|
| `token-rats login` | Open your browser to authenticate (device-code flow). Saves a token to `~/.config/token-rats/token`. |
| `token-rats sync` | Read local Claude Code, Codex, OpenCode, and Cursor usage and upload counts to your leaderboard. |
| `token-rats setup-track [path]` | Preview global instructions and enable automatic friends-only history. |
| `token-rats whoami` | Show the currently signed-in account handle. |
| `token-rats logout` | Delete your stored credentials. |
| `token-rats --version` | Print the CLI version. |
| `token-rats help` | Print this help. |

### Sync flags

```
token-rats sync [--dry-run] [--verbose] [--api-url <url>]
```

| Flag | Description |
|---|---|
| `--dry-run` | Parse files but do not upload. Prints what would be sent. |
| `--verbose` | Print which files were discovered and how many records each contains. |
| `--api-url <url>` | Override the API base URL (useful for local dev or staging). |

## What data is collected

**Usage collection reads usage metadata.** It reads:

- Input token count
- Output token count
- Model name
- Session start/end timestamps

Usage parsers discard prompt and completion content. The separate, opt-in `setup-track` feature uploads the instruction text you choose to track; it is off by default.

The collector source is in [`packages/parsers/`](../parsers/) and [`packages/cli/src/lib/`](src/lib/). You can inspect which fields are extracted before running `sync`.

## Data sources

### Claude Code

Reads `~/.claude/projects/**/*.jsonl` (macOS/Linux) or `%USERPROFILE%\.claude\projects\**\*.jsonl` (Windows).

### Cursor

Reads the Cursor sqlite cache:
- **macOS:** `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb`
- **Linux:** `~/.config/Cursor/User/globalStorage/state.vscdb`
- **Windows:** `%APPDATA%\Cursor\User\globalStorage\state.vscdb`

If the Cursor database is not found or cannot be read, the CLI skips it silently and continues with Claude Code data.

### Codex

Reads `${CODEX_HOME:-~/.codex}/sessions/**/*.jsonl` and archived sessions.

### OpenCode

Reads the `message` table in `${XDG_DATA_HOME:-~/.local/share}/opencode/opencode*.db`.
`OPENCODE_DATA_DIR` overrides the directory; `OPENCODE_DB` adds a custom database path.
The reader selects only assistant usage fields and groups them by session, provider, and model.
It includes current SQLite WAL changes. Older JSON storage is not imported.

## Auth

Authentication uses a device-code flow:

1. `token-rats login` calls the Token Rats API to get a one-time code and URL.
2. Your browser opens the URL automatically (or you can copy-paste it).
3. You sign in with GitHub on the web.
4. The CLI polls until approved, then saves your token to `~/.config/token-rats/token` (mode 0600 — readable only by you).

## Requirements

- Node.js ≥ 22.13 (for the built-in SQLite reader without a flag)
- A Token Rats account (sign up at [tokenrats.com](https://tokenrats.com))

## Privacy

Token Rats is open source. The CLI source is in [`packages/cli/`](.) and the parsers are in [`packages/parsers/`](../parsers/). You can inspect exactly what is read from your disk and what is sent to the server.

**Data boundaries:** Usage collection uploads metadata. `setup-track` additionally uploads selected instruction files after an explicit preview and opt-in. Common credential patterns and marked private sections are omitted; review the preview for other private details. Automatic versions are shared only with current friends (common private board or mutual follows), even if your profile is private.


## Automatic tracking

`token-rats login` installs the background tracker. It reads Claude Code,
Codex, OpenCode, and Cursor records on startup, then checks for changes every 30 seconds.
Failed uploads are retried. Use `login --no-daemon` to use manual sync only.
Use `daemon-status` and `uninstall-daemon` to manage automatic tracking.
After an upgrade, run `install-daemon` to copy the new runtime into place.
Custom `--api-url` settings are passed to the installed tracker.

Open `/app/compare` on your Token Rats server to enter a subscription amount
for a month. Cursor counts are estimates. API estimates are not provider bills.
See the [counting method](https://github.com/hsalberti/token-rats/blob/main/docs/counting.md).

The CLI and its documentation are MIT licensed. The npm package includes LICENSE.

## Automatic global AGENTS.md history (0.5.0)

```sh
npx token-rats@latest setup-track             # preview, confirm, install background tracker
npx token-rats@latest setup-track --dry-run   # preview only; no login, uploads, or installation
npx token-rats@latest setup-track /path/to/AGENTS.md
npx token-rats@latest setup-track --stop      # pause all captures on this machine
npx token-rats@latest setup-track --status    # list local sources; web shows live status
```

Default discovery checks `${CODEX_HOME:-~/.codex}/AGENTS.override.md` (preferred when present), otherwise `AGENTS.md`, and `${XDG_CONFIG_HOME:-~/.config}/opencode/AGENTS.md`. Supply a path for another global instructions file. Each file gets a separate history. Changing the global file location requires running `setup-track` again for the new path.

Review the preview and confirm. `--yes` skips the interactive question when you have already reviewed the preview; `--no-daemon` skips background installation, so run `token-rats watch` yourself. The installed tracker also syncs token usage.

Two stable scans coalesce rapid edits; changes usually appear within a minute while the tracker is online. Atomic file saves work. Failed uploads retry the latest saved content; edits made and replaced between scans or while offline are not a keystroke-level history. Duplicate sanitized content does not add a version. Missing files and files over 20,000 characters show an error in My setups.

To exclude a private section, use markers on separate lines (without nesting):

```md
<!-- token-rats:private -->
Instructions that must stay on this computer.
<!-- /token-rats:private -->
```

Open [My setups](https://tokenrats.com/app/setups#automatic) to pause or resume a source and view its history. Pausing retains existing versions and their audience. Hide a version with “Only me” or delete the setup to remove its history. Automatic captures cannot be made public directly; copy a reviewed excerpt to a separate manual setup for public sharing. Local file paths stay on your machine; instruction content can itself contain private information, so review it before enabling.
