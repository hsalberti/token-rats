# Open source release

This plan replaces the enterprise-first direction in older roadmaps.

## Implemented in this change

- Public community feed, categories, posts, replies, author deletion, moderator
  deletion API, and literal-text AGENTS.md downloads.
- Monthly subscription comparisons for Claude Code, Codex, and Cursor.
  Users enter their actual USD subscription amount; estimates stay separate.
- OpenRouter and OpenAI Chat Completions proxies, encrypted per-user keys,
  streaming and non-streaming usage collection, and setup pages.
- Automatic local tracking for Claude Code, Codex, and Cursor, initial history
  sync, retry after failure, serialized scans, and change detection.
- Daemon runtime copied out of temporary npm cache directories.
- Codex reasoning counted once; repeated Claude messages deduplicated;
  cache-only updates accepted; cache rates included in cost estimates.
- Atomic session and rollup updates. Parser accounting version 2 allows one
  correction of existing counts when the new CLI resends a complete session.
- MIT license for code and project documents, contribution guide, issue/PR
  templates, public document index, and launch drafts.
- Community navigation replaces enterprise promotion. New organization
  creation is paused. Existing organization data is retained.

## Release sequence

1. Back up the deployed D1 database using the normal deployment process.
2. Apply migrations `0023_open_source.sql` and `0024_atomic_usage.sql` before
   deploying the matching API. These include an atomic rollup trigger change;
   do not run the old ingest code against the new trigger schema.
3. Deploy API and web together. Refresh prices through the existing admin price
   refresh endpoint. Missing historical/cache rates stay visibly unpriced.
4. Publish the built CLI with its license. Update LATEST_CLI_VERSION only when
   that version is available on npm. Reinstall the daemon after upgrading.
5. Run sync with the new CLI to correct locally available historical records.
   Records whose logs are gone cannot be corrected from the current parser.
6. Verify sign-in, first sync, offline retry, comparison, post/reply/delete,
   and one real API response for each provider with the owner's test keys.
7. Make the repository public, then publish the [launch drafts](launch.md).

This change has not deployed, published an npm version, changed repository
visibility, sent launch posts, or created a Reddit community.

## Validation

Local validation on 2026-09-22: lint, typecheck, all 286 unit/integration tests,
production web/CLI builds, and npm package inspection passed. Four browser
checks passed across Chromium and mobile WebKit. All migrations applied in
local Wrangler; an additional SQLite check confirmed existing session fields
were preserved. Native OS service installation and paid live provider calls
were not run.

Run lint, typecheck, test, and build from the repository root. Unit and API
integration tests cover parser counting, retry queues, cache estimates,
transaction rollback, community permissions, subscription isolation, and
JSON/SSE proxy usage. The database tests load all production migrations.

The browser suite `apps/web/e2e/11-open-source.spec.ts` runs with an isolated
local API and web server. Seed a test user, set TOKEN_RATS_TEST_TOKEN to a
Token Rats token for that user, and set PLAYWRIGHT_WEB_BASE_URL to the local
web origin. It covers publish/download/reply/delete and saving a subscription.
The suite is skipped without the test token.

## Work still outside this release

- Per-event model/date attribution for sessions that cross days or change models.
- Provider invoice and quota imports; exact Cursor usage collection.
- OpenAI Responses and other API endpoint families.
- Local inference collectors (Ollama, vLLM, llama.cpp, LM Studio).
- Native desktop app, forum voting/search/notifications, and automated moderation.

The autorunner is the background usage tracker. See the
[counting limits](counting.md#known-limits) before making public claims.
