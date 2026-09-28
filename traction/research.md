# Token tracker research — 2026-09-28

## Finding

Local token tracking is established, and a social leaderboard already exists.
The strongest comparable projects are [ccusage](https://github.com/ccusage/ccusage)
and [Tokscale](https://github.com/junhoyeo/tokscale). Token Rats should lead with
the exchange of agent instructions and coordination workflows, plus a clear
accounting method, rather than claim to have invented local token tracking.

These projects are open source and inspectable. None of the sources below
establishes that a third party or a model provider certifies every cost total.
Local logs, model price catalogs, and subscription invoices answer different
questions.

| Project | Relevant technology | Evidence | Use for Token Rats |
| --- | --- | --- | --- |
| [ccusage](https://ccusage.com/guide/) | Local readers for Claude Code, Codex, OpenCode, and many other agents; daily/session reports | Maintained CLI and [OpenCode source guide](https://ccusage.com/guide/opencode/); MIT text in its repository license | Useful reference for its supported formats. Its current OpenCode guide describes legacy JSON files, so it is not a reliable independent check of this machine's SQLite database. |
| [Tokscale](https://github.com/junhoyeo/tokscale) | OpenCode SQLite and legacy storage readers, broad source discovery, TUI, and a global leaderboard | MIT repository with [OpenCode data-source details](https://github.com/junhoyeo/tokscale#opencode) | Compare counts against the same local SQLite DB; study its DB discovery and model attribution. It is a direct competitor. Workflow sharing is the differentiation. |
| [CodexBar](https://github.com/steipete/CodexBar) | Local history, quota and cost views, provider adapters | MIT repository and [CLI documentation](https://github.com/steipete/CodexBar/blob/main/docs/cli.md) | Reference provider adapter UX. It is primarily a desktop/CLI monitor, not a drop-in backend for a social web app. |
| [tokentally](https://github.com/steipete/tokentally) | TypeScript token normalization and pricing, including cache treatment | [README/API](https://github.com/steipete/tokentally/blob/main/README.md), MIT; current Node helpers require Node 24 | Candidate for a later pricing refactor once the current catalog and cash rounding are reconciled. |
| [OpenCode itself](https://dev.opencode.ai/docs/cli/#stats) | `opencode stats` and its local SQLite data | [OpenCode session usage logic](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/session/session.ts) | Baseline for field semantics. The local DB is the direct data source; no hosted wrapper is needed. |

## OpenCode format and accounting

The current stable OpenCode installation on the development machine uses
`~/.local/share/opencode/opencode.db` in WAL mode. Its `message.data` JSON has
`role`, `modelID`, `providerID`, and `tokens` fields. The SQL reader in
`packages/cli/src/lib/opencode-extract.ts` selects only these fields, session
IDs, and timestamps. It drops copied fork messages using a fingerprint of
timestamp, model, provider, agent, cost, and token fields, then groups by
session, provider, and model. [Tokscale's fork duplication report](https://github.com/junhoyeo/tokscale/issues/446)
documents why this matters. OpenCode stores
reasoning separately from output, while Token Rats treats reasoning as a
subset of output, so the reader adds reasoning to the outgoing output field.

On 2026-09-28, the local database's sum of `tokens.total` equaled the sum of
input, output, reasoning, cache reads, and cache writes exactly: 638,955,332.
The reader produced 59 session/model records: 7,727,867 input, 2,621,924
output including 1,195,986 reasoning, and 628,605,541 cache reads.
`bunx tokscale@latest --client opencode --json` independently reported the
same input and cache counts and 1,425,938 output excluding reasoning; adding
reasoning yields the reader's output exactly. Tokscale counted 4,050 assistant
messages, and `opencode stats --pure` reported 61 sessions and 10.5 million
average tokens per session, consistent with its rounded display. A 0.4.0 CLI
dry run detected OpenCode sessions alongside Codex and Cursor with no upload.
Synthetic SQLite fixtures test WAL reading, model separation, fork copies,
reasoning, and the absence of prompt content from emitted records.

The storage path can change. [Tokscale's source matrix](https://github.com/junhoyeo/tokscale#overview)
documents channel-specific database names; Token Rats scans `opencode*.db`
and honors `OPENCODE_DB`, `OPENCODE_DATA_DIR`, and `XDG_DATA_HOME`. The old JSON
store is outside this release. The [ccusage migration issue](https://github.com/ccusage/ccusage/issues/966)
is a useful reminder that readers need a format-specific check when OpenCode
changes storage.

## Adoption decision

Use the built-in `node:sqlite` reader for OpenCode 1.x because it avoids a
second installed CLI and maps directly to Token Rats' per-session ingest.
Use Tokscale and OpenCode's native stats as independent baselines before
release and when a new OpenCode schema appears. The current ccusage
[OpenCode guide](https://ccusage.com/guide/opencode/) documents JSON paths;
its [SQLite migration issue](https://github.com/ccusage/ccusage/issues/966)
explains why it is unsuitable for this machine's current OpenCode database.
It can check legacy JSON installations that it supports. Adopt upstream code only when a specific reader
or pricing component is demonstrably more reliable than the in-repo version;
preserve its license notice when copying code. The current implementation
uses format facts and no copied upstream parser code.

Next comparison targets: same-machine daily token totals, cache reads, model
switches, resumed sessions, WAL writes, and zero-usage/error messages. Treat
cost differences separately because catalogs, discounts, and local model
pricing differ. Track a mismatch with a synthetic fixture and source-version
number before changing production accounting.
