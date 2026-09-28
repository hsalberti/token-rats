# token-rats

> Sync local Claude Code, Codex, OpenCode, and Cursor usage to Token Rats.

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

**Token Rats reads usage counts only.** It reads:

- Input token count
- Output token count
- Model name
- Session start/end timestamps

It does **not** read, store, or transmit any prompt or completion content.

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

**Privacy posture:** Token Rats uploads usage metadata only. Parsers inspect local usage fields and discard prompt and completion content. Full profile instructions are shared only when you explicitly publish them.


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
