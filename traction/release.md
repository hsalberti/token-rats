# Release record

## 0.4.0 — in progress

- Repository: https://github.com/hsalberti/token-rats (public, MIT).
- Product: local OpenCode SQLite collection, retired API proxies, profile AGENTS.md publication and workflow descriptions.
- Community: https://www.reddit.com/r/TokenRats/ (Alberti will create it).
- External posts: drafts only; Alberti edits and posts them.
- Deployment commit, npm publication, production checks, and profile example URL: pending completion of this release.

## Validation before deployment

- Lint, typecheck, 281 unit/integration tests, and production CLI/web builds passed.
- Four authenticated browser checks passed across Chromium and mobile WebKit: profile save, instruction download, workflow display, and subscription comparison.
- OpenCode totals matched Tokscale after accounting for its separate reasoning field; forked history has a regression fixture.
- The staged release passed a limited common-token/private-key pattern scan.
- Remote D1 was exported to a private backup outside the repository before the additive profile migration.
