# Token Rats — Provider expansion delta

Append-only delta on [`roadmap.md`](../roadmap.md) for the **provider-selection** sub-effort (Codex parser, three-option picker, per-source tiles, "Other" picker tree). Phases, track letters, and definitions-of-done in the v1.0 roadmap stay as they are.

This is a *parallel* effort to [`v1.1-sharpen-the-edge.md`](../apps/web/app/changelog/_archive/v1.1-sharpen-the-edge.md) (the Phase 4 "sharpen the edge" push). v1.1 reuses some of the same track letters (`P`, `Q`) for entirely different work; the letters in *this* doc always refer to the **base v1.0** track names.

Reading order: `../roadmap.md` for the overall plan → this file for the provider-expansion deltas → `../research/` for the upstream-product analysis that motivates them.

---

## What changed since v1.0

| Track | Status in v1.0 | Provider-expansion change |
|---|---|---|
| Phase 1 Track A — Parsers | Claude Code + Cursor parsers | Bumped to also include **Codex** parser as a v1 source (matches the picker's top-level options Claude Code / Codex). |
| Phase 1 Track D — Web PWA | Picker not specified | Picker is a three-option control: **Claude Code · Codex · Other** (Other defers to Track P). |
| Phase 1 Track F — Pricing | Manual JSON for Claude + GPT | Add Codex price entries. |
| Phase 2 Track Q — Rich profile | Heatmap + per-room ranks + per-source tiles | Per-source tiles consume the icon set in `assets/providers/` from day one. |
| Phase 3 Track P — Provider picker "Other" | IDE / API branches | Added **Open Source** branch; provider matrix sourced from `research/codexbar.md`; tile icons sourced from `assets/providers/`. |

No contracts change. No schema change. No new tracks. Everything below slots into an existing track in `roadmap.md`.

---

## Pre-staged assets (already in the repo)

These landed alongside this doc so the agents implementing the tracks don't need to redo the legwork:

- `assets/providers/*.svg` — 40 provider logos mirrored from CodexBar (MIT). Inventory + trademark caveats in `assets/providers/README.md`. The upstream LICENSE rides along as `assets/providers/LICENSE-CodexBar`.
- `research/codexbar.md` — the per-provider auth/data-source matrix. This is the spec for Track P branches.
- `research/blackbar.md` — architectural reference for a future native helper (out of scope for v1).
- `NOTICES.md` — attribution for any vendored third-party content (currently just the CodexBar asset mirror).

---

## Track deltas

### Phase 1

**Track A — Parsers (add Codex)**
- Land `packages/parsers/codex.ts` alongside `claude-code.ts` and `cursor.ts`. Source: Codex CLI's local log directory + the optional OAuth API documented in `research/codexbar.md#how-it-accesses-token-data`.
- Fixture set: 3–5 real Codex sessions covering at least one model from the current Codex lineup.
- All three parsers (Claude Code, Codex, Cursor) emit the same `SessionRecord` from `packages/contracts`. No new fields.
- Apply lessons from the Claude Code parser: don't double-count cache tokens; aggregate sub-files sharing a sessionId before emitting.

**Track D — Web PWA (picker control)**
- The "Add a source" control on `/app` is a three-option segmented picker: **Claude Code · Codex · Other**. The picker component lives at `apps/web/components/SourcePicker.tsx`.
- "Other" is a no-op in v1 (renders a "Coming in Track P" empty state). It exists in the UI from day one so we don't have to re-do this screen later.
- The picker imports its tile art from `assets/providers/claude.svg` and `codex.svg`. Wire the asset path now even though only two icons are used in v1 — Track Q and Track P consume the rest.

**Track F — Pricing (add Codex)**
- `packages/pricing/src/prices.ts` gets Codex/OpenAI entries mirroring the Claude block shape. Cross-reference the current OpenAI pricing page via `find-docs`; commit a `prices-fetched-at` date comment.

### Phase 2

**Track Q — Rich profile (consume the icon set)**
- Per-source tiles on `/u/[handle]` render with the matching SVG from `assets/providers/`. Tile component reads the source ID from `SessionRecord.source` and looks up `${source}.svg`; falls back to a generic monogram if missing.
- Same component is reused on the leaderboard rows in Track D (a single source-pill component to maintain).
- Heatmap + sparkline visual budgets stay as written in v1.0 — the asset change is purely about not hand-drawing 40 logos.

### Phase 3

**Track P — Provider picker "Other" (Open Source branch + asset wiring)**
- Three second-level branches as called out in `roadmap.md` Track P:
  - **IDE:** Cursor, Antigravity, Other (IDE)
  - **API:** OpenAI, Anthropic, OpenRouter, Other (API)
  - **Open Source:** Ollama, vLLM, llama.cpp, LM Studio, Other (Open Source)
- Each named second-level option ships with its icon already in `assets/providers/` (where one exists upstream: cursor, antigravity, ollama, openrouter; OpenAI = `codex.svg`, Anthropic = `claude.svg`; vLLM / llama.cpp / LM Studio need a generic open-source tile until upstream icons exist).
- Auth / data-source per branch follows the matrix in `research/codexbar.md#how-it-accesses-token-data`. Implementers should **read the spec, not port the Swift** — re-derive in TypeScript.
- Open Source branch defaults to `costUsd: 0`; expose a per-room "estimate at provider X's rates" toggle so a self-hosted Llama session can still compete in a fair-comparison room.
- Trademark disclaimer copy (from `research/blackbar.md`) appears below any logo grid.

### Cross-cutting

- `NOTICES.md` at the repo root tracks attribution for third-party content. Today only assets are mirrored, covered by `assets/providers/LICENSE-CodexBar`. Promote attribution to `NOTICES.md` when any TS/JS code (e.g. a parser ported file-for-file) gets vendored.
- Pin the upstream CodexBar commit SHA cross-referenced in `research/codexbar.md` before Phase 3 starts, so the matrix is reproducible.

---

## Definition of done

The provider-expansion deltas are "done" exactly when each affected track ships its v1.0 definition-of-done **and** consumes the additions above. No separate launch — sharpening pass on existing tracks.

## What this explicitly does **not** do

- Does not introduce a native macOS menu-bar companion (CodexBar / BlackBar pattern). Out of scope for v1; revisit after Phase 3.
- Does not fork or vendor any CodexBar Swift source. Assets only.
- Does not adopt CodexBar's 30-day local cost-scan algorithm verbatim — Track A re-derives from the JSONL/log spec to avoid line-for-line transcription.
