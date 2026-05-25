# Multi-device aggregation audit — 2026-05-25

Reporter: founder. Reproducer user: `vmarcial`. Symptom: after installing the CLI on a second PC, the user sees only the second PC's stats on their profile / leaderboards.

## Conclusion in one sentence

The aggregation SQL is correct at every layer I reviewed; the most plausible failure modes are auth / identity-shaped, not query-shaped. Without `vmarcial`'s actual `users` and `sessions` rows I cannot point to a single line and say "this is the bug". This note documents what I checked and adds a regression test for the contract the bug violates, so the next report has a quicker triage path.

## What was checked

- `recordSession` (`apps/api/src/lib/ingest.ts`) — uses `INSERT OR IGNORE` keyed on `sessions.id` (PK) and `UNIQUE (user_id, dedupe_key)`. On insert success it upserts both `daily_rollup` and `daily_rollup_by_model`. Adds tokens correctly.
- `POST /v1/sessions` (`apps/api/src/routes/sessions.ts`) — auths via `requireAuth`, re-prices each record server-side, and calls `recordSession` for every record. No silent drop of records.
- `GET /v1/rooms/:code/leaderboard` (`apps/api/src/routes/leaderboard.ts`) — `SUM(dr.tokens)` over `daily_rollup` joined on `user_id`. No device dimension, no LIMIT 1, no GROUP BY trickery. Aggregation is correct.
- `GET /v1/u/:handle` (`apps/api/src/routes/profiles.ts`) — `SUM(tokens) FROM daily_rollup WHERE user_id = ?`. Same shape, also correct.
- Parser id generation (`packages/parsers/src/*.ts`):
  - Claude Code: `id = "claude-code:" + sessionId` where `sessionId` is a UUID from the JSONL. Globally unique.
  - Codex: similar — id is per-file rollout UUID. Globally unique.
  - Cursor: `id = "cursor:" + generationUUID` from per-workspace sqlite. Cursor's `generationUUID` is documented as a UUID, but I have not independently verified it is globally unique across machines. **If it is *not*, two PCs producing the same `id` would collide on the `sessions.id` PK, and the second insert would silently `INSERT OR IGNORE`.** This is the most plausible code-level bug; see "Most likely root cause" below.

## Ruled-out failure modes

- **`daily_rollup` undercount.** The upsert adds `excluded.tokens` on `ON CONFLICT`. Re-tested by hand on a fixture; it sums correctly.
- **Leaderboard JOIN dropping rows.** The query is `LEFT JOIN daily_rollup ON dr.user_id = rm.user_id AND <date clause>`. The date clause is part of the JOIN condition, not the WHERE — users with no `daily_rollup` rows render as zeros instead of being dropped. Multi-PC users with rows on both PCs land on a single `user_id` and sum cleanly.
- **CLI local dedupe.** The `seen` Set in `syncCommand` is per-run only; it does not persist across invocations or across PCs. Cannot cause cross-PC undercount.

## Most likely root causes (in descending probability)

1. **Two `users` rows.** The user signed in on PC1 with GitHub account A and on PC2 with GitHub account B (or the same GitHub account under a different email primary that re-routed through OAuth differently). Two `users.id` values → two independent `daily_rollup` buckets → the dashboard shows only the bucket of whichever account is currently signed in. *This is the easiest to diagnose and the easiest to confirm: ask `vmarcial` to run `token-rats whoami` on both PCs and compare the `handle`.*
2. **CLI auth silently broken on PC1.** A stale or invalid token in `~/.config/token-rats/token` causes `POST /v1/sessions` to return 401, the CLI's `sync` command exits with an error code, but the user is running it from cron or didn't notice. *Diagnose: ask the user to run `token-rats sync --verbose` on PC1 and look for upload errors.*
3. **Cursor `generationUUID` collisions on `sessions.id` PK.** If Cursor's per-workspace IDs are not globally unique across machines, PC2's Cursor sessions silently `INSERT OR IGNORE` against PC1's identical-id rows. This would manifest as "Cursor stats look like only one PC contributed" specifically; Claude Code / Codex would aggregate fine. *Diagnose: run `SELECT source, COUNT(*) FROM sessions WHERE user_id = (...) GROUP BY source` and compare against the user's expectation per-PC.*
4. **FNV-1a 32-bit dedupe-key collision** on `UNIQUE (user_id, dedupe_key)`. Possible but rare — the deferred SHA-256 upgrade in `roadmap.md` covers this.

## What's shipping with this audit

- **No code change to the aggregation path** — the SQL is right; "fixing" code that isn't broken just adds risk.
- **Regression test** in `apps/api/src/lib/ingest.test.ts` that exercises the contract: two sessions for the same `user_id` from two different `device_id`s, with non-overlapping `dedupe_key`s, must both insert and both sum into `daily_rollup`. Catches a future regression that would silently swallow PC2's writes.
- **Diagnostic ladder** (this document) — when the next user reports the symptom, follow the three numbered checks above in order before opening a code search.

## Followups

- If the next reported case is root cause 3 (Cursor PK collision), the fix is one line in `parseCursor`: make `id` include a per-machine prefix so even if `generationUUID` repeats across machines, the row-id doesn't. Hold the change until we see the symptom.
- If the next reported case is root cause 4 (dedupe-key collision), promote the deferred SHA-256 upgrade out of `roadmap.md`'s deferred section.
- Long-term, the device-list feature being added in this same change makes (1) and (2) self-diagnose on the dashboard: if a user has two PCs they expect to be syncing, they will *see* both as devices, and a stale-token PC will surface as "Last seen 14 days ago".
