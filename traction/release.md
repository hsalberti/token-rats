# Release record

## 0.4.0 — published and deployed

- Repository: https://github.com/hsalberti/token-rats (public, MIT).
- Product: local OpenCode SQLite collection, retired API proxies, profile AGENTS.md publication and workflow descriptions.
- Community: https://www.reddit.com/r/TokenRats/ (Alberti will create it).
- External posts: drafts only; Alberti edits and posts them.
- Public app/CLI source: [`f037b7d304dca599b418f019ede531c3929ed01f`](https://github.com/hsalberti/token-rats/commit/f037b7d304dca599b418f019ede531c3929ed01f).
- Production web: https://tokenrats.com; Pages deployment `11e21402-2197-42c1-819d-10ed85b4befd` succeeded for that commit.
- Production API: https://api.tokenrats.com; GitHub deploy run `36477243111` succeeded, Worker version `d7b1f4aa-fce3-4de0-9e41-e443625fa8cb`.
- Founder example: https://tokenrats.com/u/hsalberti. The sanitized global excerpt is published and downloadable.
- npm: [`token-rats@0.4.0`](https://www.npmjs.com/package/token-rats/v/0.4.0) is published with the `latest` tag.
- Published package gitHead: `5886adeabd6eb7105e6066771d9a74f1b0d7a370` (release code plus documentation). CI, lint, and deploy run `36478137292` passed for this commit.
- GitHub release: https://github.com/hsalberti/token-rats/releases/tag/v0.4.0, tagged at the npm package's gitHead.
- Registry tarball SHA-1: `2c42f8e944d9d5311bb7fa08ffd020a17d6d2f44`, matching the inspected publication archive.
- Registry integrity: `sha512-IYyvR61FcCnuBZng2OXl+A9kjmUeqb2TWDVJ9h9Svnlnoj85Wb332yYXIg/fzXBDPoAah4TudQ33FjKnvvWlTA==`.
- A clean installation outside the repository reported version 0.4.0 and detected 551 local sessions across Codex, OpenCode, and Cursor with `sync --dry-run`; no usage was uploaded.

## Validation before deployment

- Lint, typecheck, 281 unit/integration tests, and production CLI/web builds passed.
- Four authenticated browser checks passed across Chromium and mobile WebKit: profile save, instruction download, workflow display, and subscription comparison.
- OpenCode totals matched Tokscale after accounting for its separate reasoning field; forked history has a regression fixture.
- The staged release passed a limited common-token/private-key pattern scan.
- Remote D1 was exported to a private backup outside the repository before the additive profile migration.

## Production checks — 2026-09-28

- `/healthz` returns 200 with database and KV healthy; public founder profile returns the exact reviewed excerpt.
- Desktop Chromium and mobile WebKit both loaded the production profile, downloaded `AGENTS.md`, and found the Reddit community link.
- Retired proxy and community API endpoints return 404. The two obsolete credential tables were deleted after retirement; historical usage and forum records remain.
- Additive migration 0025 applied successfully. After credential cleanup, D1 retained all 57 users and 12,370 sessions (one new session arrived since the backup).
- CI and lint passed for the deployed commit. Authenticated E2E passed for the feature commit `188c25a`; the subsequent change only normalized the npm executable path.
- No Reddit or Hacker News posts have been published. Alberti still needs to create r/TokenRats and edit/post the launch drafts.
