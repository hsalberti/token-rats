# Token counting: algorithms across the steipete orbit

**Research date:** 2026-05-18

Side-by-side analysis of how VibeMeter, CodexBar, and `badlogic/cccost` count AI tokens, and how those approaches compare to Token Rats's current pipeline.

## Three orthogonal data-collection strategies

CodexBar uses all three; VibeMeter uses (1) and partially (2); cccost uses a fourth approach (process-wrap interception).

### 1. Local JSONL log scanning — same input as Token Rats

Both VibeMeter and CodexBar scan `~/.claude/projects/**/*.jsonl` for assistant messages with a `usage` block. Path resolution differs:

- VibeMeter: hardcoded to `~/.claude/projects/`, with a security-scoped bookmark (`ClaudeLogBookmarkManager`) for sandboxed builds.
- CodexBar: resolves `$CLAUDE_CONFIG_DIR` (comma-separated) → `~/.config/claude/projects` → `~/.claude/projects`. Token Rats should match.

### 2. Provider OAuth / Admin / Web APIs

- **Anthropic Admin API** (`https://api.anthropic.com/v1/organizations/cost_report`, `/usage_report/messages`) — auth: `x-api-key` + `anthropic-version: 2023-06-01`. Ground truth for org-level usage.
- **Claude OAuth API** (`https://api.anthropic.com/api/oauth/usage`) — auth: `Authorization: Bearer <token>` + `anthropic-beta: oauth-2025-04-20`. Reads `~/.claude/.credentials.json` for the refresh token.
- **Claude.ai web API** (`https://claude.ai/api/organizations`, `/{orgId}/usage`, `/api/account`) — auth: browser cookie `sessionKey` starting with `sk-ant-`, extracted via SweetCookieKit.
- **Cursor dashboard API** (`https://cursor.com/api/usage-summary`, `/auth/me`, `/usage?user=`) — auth: any of `WorkosCursorSessionToken`, `__Secure-next-auth.session-token`, `wos-session`, `authjs.session-token` cookies. Sent via `Cookie:` header against `https://www.cursor.com/api/*`. User-Agent `VibeMeter/1.0`, Referer `https://www.cursor.com`.

### 3. CLI PTY scraping (CodexBar)

When OAuth fails and no API key is configured, CodexBar spawns `claude` or `codex` inside a PTY watchdog, sends `/usage` or `/status`, regex-extracts identity and quota. Brittle, fallback-only.

### 4. Process-wrap interception (cccost)

Mario Zechner's approach: wrap the `claude` CLI binary in a Node script that hooks `globalThis.fetch` inside the Claude Code process. Every request to `api.anthropic.com` is intercepted and the response body's `usage` block is written to `~/.claude/projects/<cwd>/<sessionid>.usage.json` in real time. **More accurate than log-parsing** because it sees cache tokens that aren't always written to the JSONL transcript.

## Anthropic Admin API request shape

For Token Rats's eventual org plan (the `org_id` column already exists on `rooms`), this is the authoritative source:

```
GET /v1/organizations/usage_report/messages?starting_at=<RFC3339>
                                            &ending_at=<RFC3339>
                                            &bucket_width=1d
                                            &limit=31
                                            &group_by[]=model
```

Returns per-bucket `results[]` with:
- `uncached_input_tokens`
- `cache_creation.ephemeral_1h_input_tokens`
- `cache_creation.ephemeral_5m_input_tokens`
- `cache_read_input_tokens`
- `output_tokens`
- `model`

Token Rats currently doesn't use this. Worth adding as an opt-in org reconciliation source.

## The JSONL parser — fast prefilter pattern

CodexBar's `Sources/CodexBarCore/Vendored/CostUsage/CostUsageScanner+Claude.swift`:

```swift
// Byte-level prefilter before JSON decode — avoids parsing ~half the lines
guard line.bytes.containsAscii(#""type":"assistant""#) else { return }
guard line.bytes.containsAscii(#""usage""#) else { return }
// Now decode the JSON
```

Then extracts:
- `type`
- `timestamp`
- `message.model`
- `message.usage.{input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens}`
- `message.id`
- `requestId`
- `sessionId`

**Token Rats application:** add the same byte-level prefilter to `packages/parsers`. With multi-MB JSONL files the savings add up, and it's especially relevant if parsing in a Worker (CPU-budgeted).

## The dedupe key — `messageId:requestId`

This is the most important finding. CodexBar's dedupe is per-entry, not per-session:

```swift
let key = "\(messageId):\(requestId)"
// "Streaming chunks share message.id + requestId inside a file.
//  Keep overwriting so the final cumulative chunk wins."
```

Rows missing either ID are kept as distinct (safer than dropping them).

This catches **two failure modes** that Token Rats's current per-session `sessions.dedupe_key` misses:

1. **Streaming chunks** — Claude Code writes multiple JSONL lines for a single assistant turn with cumulative `usage` counts. Without `messageId:requestId` dedupe, you sum the chunks instead of taking the last.

2. **`/resume` and subagent replays** — Claude Code's `/resume` and subagent feature copy prior turns into the child session's JSONL file. Naïve per-file aggregation double-counts. CodexBar's `v0.27` CHANGELOG: *"de-duplicate copied fork/resume transcript history by provider response identity so local cost estimates do not overcount repeated rows."*

3. **Subagent JSONL fan-out** — CodexBar's `v0.20` CHANGELOG: *"fix token and cost inflation caused by cross-file double counting of subagent JSONL logs, fix streaming chunk deduplication."*

**Token Rats's parsers should dedupe at the `(message.id, requestId)` level** before rolling up into `SessionRecord`. Track it in the `daily_rollup` table or expose it on a new `MessageRecord` upload path.

## Incremental scanning — the offset-based approach

CodexBar's `CostUsageJsonl.swift`:

```swift
struct Line { let bytes: Data; let wasTruncated: Bool }

static func scan(
    fileURL: URL,
    offset: Int64 = 0,         // last parsed byte
    maxLineBytes: Int,          // cap per-line buffer
    prefixBytes: Int,           // truncated lines surface this much
    onLine: (Line) -> Void
) throws -> Int64               // returns new offset
```

- 256KB chunked reads (no mmap — works fine with growing files)
- Caller passes `offset = lastParsedBytes`, `seek`s there, returns new offset
- `maxLineBytes` caps per-line buffering; if exceeded only `prefixBytes` surface with `wasTruncated = true` (filtered out downstream)

The scanner stores per-file `(fileId, mtime, size, parsedBytes)` so re-scans only read new tail bytes.

VibeMeter's older approach was a tail-hash optimization: SHA-256 only the first and last 1KB of files ≥2KB (Claude Code JSONL is append-only). Worked, but the offset model is more rigorous.

**Token Rats application:** the CLI currently re-parses files on every `sync`. Move to the offset model with state at `~/.cache/token-rats/scan-state.json` keyed by `(inode, device)` or path. Big wall-clock win for large repos.

## Pricing — `models.dev` with a 24-hour cache

CodexBar's `Sources/CodexBarCore/Vendored/CostUsage/ModelsDevPricing.swift`:

- **Source:** `https://models.dev/api.json` — no auth, community-maintained, covers all major providers
- **Cache:** `~/Library/Caches/CodexBar/model-pricing/models-dev-v1.json`, 24h TTL
- **Last-good fallback:** if the fetch fails, the cached value stays usable indefinitely
- **Refresh model:** sync `lookup()` reads cache; async `refreshIfNeeded()` triggers a background refresh. Never blocks.

### Model ID normalization (CostUsagePricing.swift)

CodexBar strips prefixes and date suffixes before lookup:
- Strip `anthropic.` / `openai/` / etc. provider prefixes
- Strip `-v\d+:\d+$` (Bedrock-style: `-v1:0`)
- Strip `-\d{8}$` (date suffixes: `claude-sonnet-4-5-20250929` → `claude-sonnet-4-5`)
- Provider-scoped lookup — same model ID under `openai` vs `google-vertex-anthropic` won't cross-contaminate

### Tiered pricing

Claude's 200k context tier handled via:
```swift
func tiered(_ tokens: Int, base: Double, above: Double?, threshold: Int?) -> Double
```
Tokens below threshold at base rate, above at premium.

### Cost computation

```swift
cost += inputTokens * inputCost
cost += outputTokens * outputCost
cost += cacheCreationTokens * cacheCreationCost
cost += cacheReadTokens * cacheReadCost
```

Per-token rates (models.dev publishes per 1M; convert by dividing by 1e6).

**Token Rats application:** the biggest single lift in this research. Replace `packages/pricing/prices.json` as primary source with `models.dev` lookups. Keep `prices.json` as offline fallback. See [`proposals.md`](./proposals.md).

## Aggregation output — the ccusage shape

CodexBar's output models follow `ccusage` (the npm tool by ryoppippi):

```swift
struct Entry {
    let date: String
    let inputTokens: Int
    let cacheReadTokens: Int
    let cacheCreationTokens: Int
    let outputTokens: Int
    let totalTokens: Int
    let costUSD: Double
    let modelsUsed: [String]
    let modelBreakdowns: [ModelBreakdown]
}
// Plus CostUsageDailyReport, CostUsageSessionReport, CostUsageMonthlyReport
```

Cache lives at `~/Library/Caches/CodexBar/cost-usage/claude-v2.json`.

**Token Rats application:** the `cache_read_input_tokens` / `cache_creation_input_tokens` are first-class — make sure `SessionRecord` in `packages/contracts` and `daily_rollup` in D1 handle them as separate columns. Cache tokens at near-zero cost are a meaningful fraction of total tokens in long sessions.

## 5-hour sliding window

VibeMeter's `ClaudeFiveHourWindowCalculator.swift`:

```swift
let fiveHoursAgo = now.addingTimeInterval(-5 * 60 * 60)
entries.filter { $0.timestamp >= fiveHoursAgo }
```

Sliding window, not a fixed bucket. Free-tier accounts reset at midnight America/Los_Angeles.

**Token Rats application:** if/when the menu bar widget surfaces "you're about to hit your rate limit," this is the right algorithm. Not relevant to leaderboards.

## Privacy boundaries — what NOT to do

- **Don't tokenize prompts.** VibeMeter's 2025 SIMD16 BPE tokenizer (using OpenAI's `o200k_base` vocab) is gone — Steinberger removed it because Claude Code already writes canonical counts in the `usage` field. Re-tokenizing was over-engineering.
- **Don't read `content` arrays.** Only `usage` blocks. Token Rats's mission statement already encodes this.
- **Don't proxy through your own server unless explicitly opt-in.** All Steinberger apps go point-to-point with provider APIs. Token Rats's Worker is for *aggregated counts*, not for proxying provider traffic.
- **Don't scrape claude.ai cookies as a default.** Violates ToS in spirit, requires Full Disk Access, breaks every UI change. Reserve as a last-resort fallback when OAuth + API are unavailable.

## What to NOT borrow from CodexBar

- **PTY scraping the `claude` CLI for `/status`.** Brittle, version-dependent, breaks when prompt wording changes. Use only as a desperate fallback.
- **40+ providers.** Token Rats's scope is Claude Code + Cursor + (optional) a few API providers. Don't drown in provider sprawl.

## Bug history worth knowing

From CodexBar's CHANGELOG — landmines you'll hit if you copy the architecture:

- **v0.20:** subagent JSONL fan-out → cross-file double counting; streaming chunk dedup needed `messageId:requestId`.
- **v0.27:** `/resume` and forked sessions copy prior turns; per-message dedupe must span files.
- **v0.27:** Near-duplicate weekly/session windows in charts — collapse by provider response identity.

## What Token Rats already does better

- **Cross-device aggregation.** CodexBar is single-machine, single-user. Token Rats's Worker + room model is a different product category.
- **Server-side daily rollup.** `daily_rollup` D1 table at the right granularity for leaderboards.
- **Schema-first contracts (`packages/contracts` with Zod).** CodexBar has no analogue.
- **Explicit privacy boundary** in `mission.md` ("counts only, never content"). Worth keeping load-bearing.

## Summary — the proposals that come out of this

See [`proposals.md`](./proposals.md) for the prioritized roadmap. The top three:

1. **Per-message dedupe via `(messageId, requestId)`** in `packages/parsers` before rolling up to `SessionRecord`. Fixes streaming chunk over-count and `/resume` replay double-count.
2. **`models.dev` as the primary pricing source** with `prices.json` as offline fallback. Add date-suffix and provider-prefix stripping rules from CodexBar.
3. **Incremental file scanning** with stored `(fileId, size, parsedBytes, mtime)` in `~/.cache/token-rats/scan-state.json`. Stops the CLI from re-parsing GB of JSONL every `sync`.
