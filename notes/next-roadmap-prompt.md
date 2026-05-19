# Prompt — "Interview me for the v1.1 roadmap"

> **Historical.** Kept for reference. This bootstrap workflow is being superseded by the `/ship-phase` skill. The file paths referenced below (`testing-first-roadmap.md`, `roadmap-v1.1.md`, etc.) are stale post-reorg — see `apps/web/app/changelog/_archive/` for archived roadmaps and `notes/` for sibling docs.

Paste the block below into a fresh agent session (e.g. `claude` in the repo root, or an Agent call). It sets the agent up to read the current state, form an independent opinion of the gaps, and interview you with focused questions before drafting `roadmap-v1.1.md`.

---

```
You are helping me draft the v1.1 roadmap for Token Rats. The v1 spec
work is already on disk in this repo on the branch
`claude/draft-spec-documents-0bwEQ` (now merged to main). Phases 0
through 3 of the original roadmap are landed: monorepo + locked
contracts, vertical slice (parsers + CLI + API + web), virality
(rooms polish + streaks/challenges + cards v2 + onboarding +
push/email), and scale (real-time daemon + Anthropic proxy + public
profiles + paid org plan). 98 automated tests pass; some provider
integrations (VAPID payload encryption, email delivery, Stripe
customer create) are deliberate stubs.

## Step 1 — read context (do this BEFORE asking me anything)

Read, in order, with the Read tool:
  1. `mission.md`            — product, audience, success metrics
  2. `roadmap.md`             — the original Phase 0–3 plan
  3. `testing-first-roadmap.md` — the verification checklist + known gaps
  4. `tech-stack.md`          — the architecture I committed to
  5. Skim `apps/api/src/routes/` and `apps/web/app/` to confirm what's
     actually shipped vs what the docs claim.

After reading, form a private opinion on:
  - which v1 success metric from `mission.md` (signups / friend-graph
    activation / D7 retention / share cards per user / sources working)
    is most at risk
  - which Phase 3 track was the riskiest bet vs. the safest one
  - which §4 deploy-preflight gap is the biggest launch blocker
  - what I probably over-built vs under-built

## Step 2 — interview me

Ask me 4 to 7 questions using the AskUserQuestion tool, ONE QUESTION
PER TOOL CALL. Each question should:
  - have 2–4 mutually-exclusive choices (no "other")
  - target a real decision (don't ask "what do you want" — propose
    options and tradeoffs)
  - reveal something you couldn't infer from the docs alone

Topics to cover (pick the ones that actually move the v1.1 plan;
don't ask all of these):
  - what's the LAUNCH plan and timeline — soft-launch to a Discord,
    HN front page, X reply guys, etc.
  - which v1 metric to optimize for first in v1.1
  - tolerance for stubs at launch (email-via-console, push-as-ping,
    no-Stripe-customer) vs. blocking on full wiring
  - which Phase 3 track was a mistake and should be deprioritized
    or removed from the public surface
  - what's the next ONE feature you'd build if you only had a week —
    options like a VS Code extension as a source, server-side
    streak DM bot, public homepage trending widget, weekly recap
    auto-tweets, paid Pro tier for individuals, etc.
  - whether to invest in a v1.1 vs. fix the unsexy stuff (real Web
    Push payload encryption, Playwright E2E, a real Stripe customer
    create flow)
  - your real audience signal — have you posted anything publicly
    about this yet, and what was the response

DON'T ask me anything you can answer by reading the repo (e.g.
"what stack are you using" — you already know).

## Step 3 — draft `roadmap-v1.1.md`

Once I've answered, write `roadmap-v1.1.md` in the same shape as
`roadmap.md`: phases with explicit parallel tracks, definition of
done per track, and a parallelization summary. Optimize the plan
around the answers I gave you, not around what's "thorough."

Then ask me to confirm before committing it.

## Ground rules

- Don't change any code in this session. This is purely planning.
- Don't propose anything that requires Anthropic or Cloudflare to
  ship a feature for us.
- Don't propose features that violate the "counts only, never
  prompts" principle from mission.md.
- Keep each question under 100 words. Keep each option label under
  40 chars.
- If I push back on a question, accept and move on — don't argue.
```

---

## How to use it

1. Open a fresh agent session in the repo root.
2. Paste the block above as your first message.
3. Answer the questions as they come.
4. Review the draft `roadmap-v1.1.md` before letting the agent commit it.
