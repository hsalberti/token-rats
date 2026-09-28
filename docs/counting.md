# Token and cost method

## Inputs

| Source | Collection | Quality |
| --- | --- | --- |
| Claude Code | Local JSONL usage fields | Reported counts; repeated message IDs are deduplicated |
| Codex | Local rollout cumulative usage | Reported counts; reasoning is part of output |
| OpenCode | Local SQLite assistant message usage fields | Reported counts; grouped by session, provider, and model |
| Cursor | Local generation records | Estimated counts, not measured provider usage |

The autorunner scans all supported local sources at startup and every 30 seconds.
It serializes scans, acknowledges records only after a successful upload, and
retries failures. A restart rescans local logs. Server deduplication prevents
repeated uploads from adding the same record again. Custom CLAUDE_CONFIG_DIR
and CODEX_HOME paths are supported. OpenCode discovery checks OPENCODE_DB,
OPENCODE_DATA_DIR, and XDG_DATA_HOME. The OpenCode reader supports current
SQLite databases, including write-ahead log changes. It deduplicates copied
assistant usage when sessions are forked. It does not import older JSON storage.

## Token fields

`inTokens` is uncached input. Cache reads and writes are separate. `outTokens`
already includes reasoning; `reasoningTokens` is a breakdown of output.
The comparison total is input + cache reads + cache writes + output.
Leaderboard totals use uncached input + output. For OpenCode, reasoning is
added to its separately reported output so it appears exactly once.

OpenAI documents output as including non-visible generated tokens. See
[Counting tokens](https://developers.openai.com/api/docs/guides/token-counting).
OpenCode's stored total equals input + output + reasoning + cache reads +
cache writes. A local database check confirmed this identity across the data
available on 2026-09-28.

## Cost

The daily catalog refresh reads OpenRouter model prices. Estimates use the
latest stored snapshot on or before the session date. Input, output, cache
read, and cache write rates are separate. Missing cache rates make a record
unpriced for the comparison. Missing rates never prove that usage was free.
Comparison estimates sum unrounded USD amounts; existing leaderboard storage
rounds each session to cents. Provider
invoices can include other fees, service tiers, credits, or discounts.

The subscription amount is entered by the user for one UTC calendar month.
It is not fetched from the provider. Historical proxy records are excluded
from the subscription comparison. A tokens-per-dollar value describes recorded usage,
not quality, savings, unused quota, or a provider guarantee.

## Known limits

- Claude Code and Codex sessions use their start date and last recorded model.
  OpenCode is grouped by session, provider, and model, but a group that crosses
  midnight still uses its first message's date. Do not use this as an invoice audit.
- Local logs do not identify every billing arrangement. CLI use with an API
  key can appear in local tool totals. The user must choose a matching comparison.
- Historical logs can be absent or incomplete. Empty charts mean no records.
- Cursor local counts are estimates. The current display cannot compare
  Cursor measured token efficiency with Claude Code or Codex.
- OpenCode provider names outside the supported provider vocabulary are marked
  unknown; their token counts remain visible even when a price is unavailable.
- Provider account quotas, automatic invoice imports, and local inference
  runtime collectors remain future work.

## Data boundaries

The local CLI uploads session IDs, counts, model/provider names, timestamps,
and an opaque device ID. It does not upload prompts, responses, local paths,
or AGENTS.md content. The OpenCode SQLite query selects only session IDs,
model/provider names, timestamps, and token counts from assistant messages.
Profile sharing displays the instructions and workflow text authors choose to publish.
Community discussion takes place on Reddit.
