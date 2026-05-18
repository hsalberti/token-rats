# token-rats

> Strava for AI token burn — sync your Claude Code + Cursor usage to your Token Rats leaderboard.

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
| `token-rats sync` | Discover Claude Code logs and the Cursor cache, parse them, and upload counts to your leaderboard. |
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

The parser source code is in [`packages/parsers/`](../parsers/). You can audit exactly what is extracted before running `sync`. **We literally can't read what you typed.**

## Data sources

### Claude Code

Reads `~/.claude/projects/**/*.jsonl` (macOS/Linux) or `%USERPROFILE%\.claude\projects\**\*.jsonl` (Windows).

### Cursor

Reads the Cursor sqlite cache:
- **macOS:** `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb`
- **Linux:** `~/.config/Cursor/User/globalStorage/state.vscdb`
- **Windows:** `%APPDATA%\Cursor\User\globalStorage\state.vscdb`

If the Cursor database is not found or cannot be read, the CLI skips it silently and continues with Claude Code data.

## Auth

Authentication uses a device-code flow:

1. `token-rats login` calls the Token Rats API to get a one-time code and URL.
2. Your browser opens the URL automatically (or you can copy-paste it).
3. You sign in with GitHub on the web.
4. The CLI polls until approved, then saves your token to `~/.config/token-rats/token` (mode 0600 — readable only by you).

## Requirements

- Node.js ≥ 20
- A Token Rats account (sign up at [tokenrats.dev](https://tokenrats.dev))

## Privacy

Token Rats is open source. The CLI source is in [`packages/cli/`](.) and the parsers are in [`packages/parsers/`](../parsers/). You can inspect exactly what is read from your disk and what is sent to the server.

**Privacy posture:** Token Rats reads usage counts only — never prompts or completions. The parser source is in `packages/parsers/`. We literally can't read what you typed.

## License

MIT
