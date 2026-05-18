# Provider icons

40 SVG provider logos mirrored from
[steipete/CodexBar](https://github.com/steipete/CodexBar/tree/main/Sources/CodexBar/Resources)
at the commit on `main` as of 2026-05-18. Used to scaffold Track P
(provider picker) and Track Q (rich profile dashboard) without
re-drawing every brand mark.

## Inventory

abacus, alibaba, amp, antigravity, augment, bedrock, claude, codebuff,
codex, commandcode, copilot, crof, cursor, deepgram, deepseek, doubao,
elevenlabs, factory, gemini, grok, jetbrains, kilo, kimi, kiro, manus,
mimo, minimax, mistral, ollama, opencode, opencodego, openrouter,
perplexity, stepfun, synthetic, venice, vertexai, warp, windsurf, zai.

## License & attribution

The SVG files in this directory were copied from CodexBar, which is
licensed under **MIT** — see `LICENSE-CodexBar` for the upstream
copyright notice that must travel with these files.

**Important — trademarks are not covered by MIT.** Each SVG depicts a
third-party brand mark (Anthropic / OpenAI / Cursor / Google /
Microsoft / etc.). MIT gives us permission to reuse CodexBar's *file
assets*; it does **not** grant us permission to use each company's
trademarks. Before shipping any of these in production:

1. Confirm each provider's brand-asset policy allows third-party use in
   a leaderboard / comparison context (most do for "identification of
   the service" without endorsement claims).
2. Add a visible "Token Rats is an independent tool, not affiliated
   with Anthropic / OpenAI / …" disclaimer wherever logos appear
   (Phase 1 Track D, Phase 2 Track Q, Phase 3 Track N).
3. Treat anything that fails (1) as a placeholder and replace with a
   generic monogram tile.

## Format note

These are SVG, not PNG — strictly better (scalable, smaller, themeable
via `currentColor` where applicable). If a PNG-only consumer needs
them later, batch-convert at build time.
