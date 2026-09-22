# Token and cost method

## Inputs

| Source | Collection | Quality |
| --- | --- | --- |
| Claude Code | Local JSONL usage fields | Reported counts; repeated message IDs are deduplicated |
| Codex | Local rollout cumulative usage | Reported counts; reasoning is part of output |
| Cursor | Local generation records | Estimated counts, not measured provider usage |
| Anthropic API | Optional Messages proxy | Response usage |
| OpenRouter / OpenAI API | Optional Chat Completions proxy | Response usage, including final SSE usage |

The autorunner scans all supported local sources at startup and every 30 seconds.
It serializes scans, acknowledges records only after a successful upload, and
retries failures. A restart rescans local logs. Server deduplication prevents
repeated uploads from adding the same record again. Custom CLAUDE_CONFIG_DIR
and CODEX_HOME paths are supported.

## Token fields

`inTokens` is uncached input. Cache reads and writes are separate. `outTokens`
already includes reasoning; `reasoningTokens` is a breakdown of output.
The comparison total is input + cache reads + cache writes + output.
Existing leaderboard totals use uncached input + output.

OpenAI documents output as including non-visible generated tokens. See
[Counting tokens](https://developers.openai.com/api/docs/guides/token-counting).
OpenRouter reports usage in the complete response or final SSE message. See
[Usage accounting](https://openrouter.ai/docs/cookbook/administration/usage-accounting).

## Cost

The daily catalog refresh reads OpenRouter model prices. Estimates use the
latest stored snapshot on or before the session date. Input, output, cache
read, and cache write rates are separate. Missing cache rates make a record
unpriced for the comparison. Missing rates never prove that usage was free.
Comparison estimates sum unrounded USD amounts; existing leaderboard storage
rounds each session to cents. API proxy costs are estimates too. Provider
invoices can include other fees, service tiers, credits, or discounts.

The subscription amount is entered by the user for one UTC calendar month.
It is not fetched from the provider. API proxy usage is excluded from the
subscription comparison. A tokens-per-dollar value describes recorded usage,
not quality, savings, unused quota, or a provider guarantee.

## Known limits

- Local sessions use their start date and last recorded model. A session that
  crosses midnight or switches models needs a future event-level accounting
  format for exact attribution. Do not use this release as an invoice audit.
- Local logs do not identify every billing arrangement. CLI use with an API
  key can appear in local tool totals. The user must choose a matching comparison.
- Historical logs can be absent or incomplete. Empty charts mean no records.
- Cursor local counts are estimates. The current display cannot compare
  Cursor measured token efficiency with Claude Code or Codex.
- A proxy stream that ends before the final usage event cannot provide a
  complete usage total. We do not invent one.
- The new OpenAI/OpenRouter proxy implements Chat Completions. Responses,
  realtime, image, and audio endpoints are not implemented.
- Provider account quotas, automatic invoice imports, and local inference
  runtime collectors remain future work.

## Data boundaries

The local CLI uploads session IDs, counts, model/provider names, timestamps,
and an opaque device ID. It does not upload prompts, responses, local paths,
or AGENTS.md content. The optional proxy receives request and response
content in transit; it stores usage metadata. Community posts and replies
store the text their authors explicitly publish.
