# Sharpening prompt — paste into a fresh Claude Code conversation

Use this when `roadmap.md` is too vague to act on. The agent reads the roadmap, looks at the codebase to understand what each feature actually touches, then interviews you with focused questions until every feature is unambiguous. Output: an updated `roadmap.md`. **No implementation.**

Copy the block below into a new session in the repo root.

---

```
You are sharpening `roadmap.md` for me. This is a planning session — you write to `roadmap.md` only, never to source code, tests, infra, or migrations. Don't open PRs, don't run builds.

## How this repo works

- `roadmap.md` is the **pending features list**. Shipped features move out of it into the `PATCHES` array in `apps/web/app/changelog/page.tsx`. The file you'll edit is always *to-do, never done*.
- Each feature is a flat top-level entry, no "Track <letter>" prefix, no phase grouping.
- Color codes signal parallelism: 🟩 parallel, 🟦 sequential (depends on another feature here), 🟨 convergence (depends on multiple). Most features should end up 🟩.
- `roadmap-deferred.md` is the long-lived parking lot for big deferred items.
- `notes/` holds sibling planning docs that are not the active roadmap.

## What you do in this session

1. **Read the roadmap.** `roadmap.md`, plus skim `roadmap-deferred.md` and `mission.md` for context. Note the "Locked product decisions" — those are commitments, not topics to re-open unless I bring them up.

2. **Map each feature to the code.** For every feature entry, look at the files it claims to touch. Confirm those files exist; note anything that's already partially shipped (e.g. backend done, frontend pending). If a feature's "Touches" line is wrong or stale, flag it.

3. **Identify what's actually unclear.** A feature is sharp enough when a competent agent could implement it without asking me a single product question. Examples of fuzz worth interrogating:
   - User-facing edge cases (what happens when the viewer is signed out / new / non-member / banned?)
   - Cache + invalidation rules (whose cache, what key family, when to bust it?)
   - Migration ordering and idempotency
   - Empty / loading / error states for new UI
   - What the OG card variant looks like
   - Performance budgets (cold ms, cached ms, payload size)
   - What a "good enough v1" looks like vs scope creep
   - Whether helpers/components already exist (don't re-implement what's shipped)

4. **Interview me, one feature at a time.** Use `AskUserQuestion` for actual multiple-choice product decisions; use plain prose questions when I need to free-form. Cap each round at 4 questions. Tell me which feature you're sharpening *first* before any question so I know what's on the table.

5. **Sharpen, then move on.** After I've answered, rewrite that feature's entry in `roadmap.md` with the new precision (definition-of-done bullets, cache rules, edge-case behavior, etc.). Re-read the file before the next feature so you don't drift.

6. **Surface conflicts.** If two features would race on the same file, the same contract type, or the same migration number, name the conflict and propose a resolution before I have to spot it.

7. **Don't add scope.** If I describe something that feels like a new feature, ask whether it belongs in `roadmap.md`, `roadmap-deferred.md`, or just dropped. Don't smuggle scope in via sharpening.

## What "done with sharpening" looks like

- Every feature in `roadmap.md` has a clear user-facing description, a verified "Touches" line, a definition-of-done bullet list, and any cache / migration / order constraints noted.
- The color codes are accurate — anything truly 🟦 sequential or 🟨 convergence is labeled and the dependency is named.
- I leave the session with a roadmap that an agent (or future-me) could pick up cold and start implementing.

## Tone

- Concise. Ask one thing at a time, don't pile up context.
- Lead with what *you* think the answer is (with one sentence of reasoning) and ask me to confirm or redirect. Don't make me design from scratch every time.
- If I push back on a question being premature ("we'll figure that out later"), accept it, mark the entry with `[OPEN]` next to the unclear bit, and move on.

Start by reading `roadmap.md` and listing the features you found. Then pick the first one and tell me you're sharpening it.
```

---

## Why this lives in `notes/` and not as a skill

Skills carry an upfront authoring cost (frontmatter, invocation rules, args parsing). This prompt is a paste-target — copy it into a fresh session and you're going. If we find ourselves running this often enough to want `/sharpen-roadmap` to invoke it natively, the prompt above becomes the body of `~/.claude/skills/sharpen-roadmap/SKILL.md` with minimal rewriting.
