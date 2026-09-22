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

1. Back up the deployed D1 database with `wrangler d1 export token-rats --remote`.
   Keep the export outside the repository.
2. For an existing deployment, run `wrangler deploy src/maintenance.ts` from
   `apps/api` and let active requests finish. Then apply migrations
   `0023_open_source.sql` and `0024_atomic_usage.sql` with
   `wrangler d1 migrations apply token-rats --remote`. These include an atomic
   rollup trigger change; do not run the old ingest code against the new schema.
   Restore the API immediately with `wrangler deploy`.
3. Deploy API and web together. Refresh prices through the existing admin price
   refresh endpoint. Missing historical/cache rates stay visibly unpriced.
4. Publish the built CLI with its license. Update LATEST_CLI_VERSION only when
   that version is available on npm. Reinstall the daemon after upgrading.
5. Run sync with the new CLI to correct locally available historical records.
   Records whose logs are gone cannot be corrected from the current parser.
6. Verify sign-in, first sync, offline retry, comparison, post/reply/delete,
   and one real API response for each provider with the owner's test keys.
7. Make the repository public. The [launch drafts](launch.md) are ready for the
   owner to post to Hacker News and Reddit.

## Release status — 2026-09-22

- API and web deployed to [tokenrats.com](https://tokenrats.com).
- Both D1 migrations applied after an export and a temporary API maintenance
  window. All 12,289 existing sessions and 57 users remained after migration.
- Price refresh completed: 447 catalog entries and snapshots, no errors.
- [Source and documents](https://github.com/hsalberti/token-rats) are public
  under the MIT license.
- CLI npm publication is awaiting the owner's npm browser authentication.
- Hacker News and Reddit posts remain drafts. No Reddit community was created.

## Validation

Local validation on 2026-09-22: lint, typecheck, all 286 unit/integration tests,
production web/CLI builds, and npm package inspection passed. Four browser
checks passed across Chromium and mobile WebKit. All migrations applied in
local Wrangler; an additional SQLite check confirmed existing session fields
were preserved. Native OS service installation and paid live provider calls
were not run.

Live checks passed for API health, community reads, authenticated comparison,
and authentication on private endpoints. The community, comparison, and proxy
pages loaded without browser errors in Chromium and WebKit.

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
