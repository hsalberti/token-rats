# Workflow + skills plan

Reference for the roadmap-driven workflow and the skills that support it. **None of these skills exist as code yet** (except `/roadmap-diagram`, which is being updated to match the new nomenclature). This doc is the spec we agree on *before* writing any of the skill files.

## The loop

```
sharpen roadmap.md (fresh session, planning only)
        │
        ▼
set a /goal (start an iterating session)
        │
        ▼
Claude picks the next feature, implements it,
spawning agents when work genuinely parallelizes
        │
        ▼
human reviews + tests locally + tweaks
        │
        ▼
push to prod (`main`)
        │
        ▼
/ship feature-slug
   ├── moves the feature out of roadmap.md
   └── adds a PATCHES entry to apps/web/app/changelog/page.tsx
        │
        ▼
loop back to "Claude picks the next feature" until roadmap.md is empty
```

The cycle is **continuous, not phased.** A feature shipping is a small, frequent event. There is no "Phase 5a is complete" moment unless the human decides to declare one.

## Conventions

- `roadmap.md` is the **pending features list**. Always to-do, never done. Flat top-level entries, no track letters, no phase grouping.
- `roadmap-deferred.md` is the long-lived parking lot for big items deliberately not in scope right now.
- `apps/web/app/changelog/page.tsx` holds the `PATCHES` array — the public, curated record of shipped work.
- `apps/web/app/changelog/_archive/` holds frozen phase snapshots from before this convention (v1.0, v1.1, v1.2). **We do not add to this folder in normal flow.**
- `notes/` is for sibling planning docs that are not the active roadmap (provider expansion, sharpening prompt, this file).

## Color codes (in `roadmap.md`)

- 🟩 **Parallel** — independent of every other feature in the file; can ship alongside any other 🟩.
- 🟦 **Sequential** — depends on another feature in this file landing first. The dependency must be named in the entry body.
- 🟨 **Convergence** — depends on multiple parallel features landing. Typically end-of-cycle (e.g., a test suite that asserts the new surfaces).

Most features should be 🟩. If you find yourself labeling more than a third of the list as 🟦, the features are probably scoped too small — merge them.

## Skills

### 1. `/sharpen-roadmap` (paste-prompt for now, skill later)

**Status:** Lives as a paste-target in `notes/sharpen-roadmap-prompt.md`. Promote to `~/.claude/skills/sharpen-roadmap/` once we've used it a few times and the prompt has stabilized.

**Job:** A planning-only mode. Reads `roadmap.md`, maps each feature to the actual code, asks one feature's worth of questions at a time, rewrites that feature's entry, moves on. Cannot touch source code, tests, infra, or migrations — only `roadmap.md`.

**Why a fresh session, not the working one:** sharpening is a different mental mode from implementing. Mixing them invites scope creep ("while you're in there, just also...") and burns context on planning when you should be coding.

### 2. `/goal <prompt>` (no skill needed — directive)

**Status:** Not a skill. This is the conversational handshake between the human and the working session: "your job until I say otherwise is to complete the items in `roadmap.md`, top to bottom, spawning agents when it speeds things up."

If we end up wanting a slash-command shape for this, it would just be an alias that injects a standard "iterate the roadmap" prompt into the session. Not worth coding until we feel the friction.

### 3. `/ship <feature-slug>` (skill, when the workflow has run once or twice)

**Status:** Designed; not implemented yet.

**Job:** A feature has shipped to `main`. This skill:

1. Confirms the feature is real — looks for the slug as a section heading in `roadmap.md`. If missing, error out.
2. Asks the human for the public-facing changelog copy: title (≤6 words), one-sentence body, tone (`new` / `improved` / `fixed` / `security`). Recommend defaults from the feature's user-facing description.
3. Removes the feature's section from `roadmap.md`.
4. Appends an item to the in-flight `PATCHES` entry in `apps/web/app/changelog/page.tsx`. If the current top entry is older than ~30 days or the human asks, prompt to start a new patch version + codename.
5. Optionally re-runs `/roadmap-diagram` so the board reflects the new state.
6. Stages and prints the diff for human review. Does **not** commit (per the cross-skill rule that humans drive commits).

**Edge cases the skill must handle:**
- The feature slug doesn't match any heading → bail with a clear error.
- The feature is partially shipped (some surfaces live, some not) → ask whether to split the entry into a "shipped" PATCHES item and a "remaining" sharpened roadmap entry, or to ship the whole thing.
- `roadmap.md` is now empty → suggest declaring a phase complete, snapshot the deferred file to `_archive/`, and start a new roadmap from the deferred items.

### 4. `/changelog-sync` (skill, lower priority)

**Status:** Designed; not implemented yet. Lower leverage than `/ship` because `/ship` covers the common case.

**Job:** Retrospective sweep. Diffs `main` since the latest `PATCHES` entry's most recent referenced commit, auto-categorizes each by Conventional-Commit-ish prefix or LLM, proposes additions, and applies them on human confirmation. Useful when several features shipped without running `/ship` for each.

### 5. `/roadmap-diagram` (existing skill, being updated)

**Status:** Exists at `~/.claude/skills/roadmap-diagram/`. Being updated to match the new flat-feature convention — no more "Track <letter>" requirement; features are addressed by kebab-slug of the heading.

**Job (unchanged):** Parse `roadmap.md` into structured JSON; classify into themes; compute status deterministically from git/CI/deploy; render a swim-lane HTML board.

**Visual roadmap (separate from nomenclature):** the template is text-heavy and not visually striking enough. That's a template iteration, not a skill rewrite — handle it when we want to spend time on the board's look.

## What we explicitly are *not* building

- A daemon that watches `main` and auto-runs `/ship` on every merge. Humans approve patch notes.
- A skill that auto-archives roadmap snapshots on a schedule. Archives are a deliberate "we shipped a phase" act, not a cron.
- A "next feature" picker that reads telemetry / issues / external signals. The roadmap is the source of truth; if it needs reordering, that's a sharpening conversation.
