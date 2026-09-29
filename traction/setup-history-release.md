# Setup history release

Status: implementation and local verification complete; production rollout in progress.

## Scope

- Named setups with saved file bundles, tools, models, subscriptions, and workflow notes.
- Private checkpoints, explicit publication, chronological timeline, text diffs, restore as a new version, file/bundle downloads, attributed private copies, and a featured profile setup.
- Explicit follows, Following/Discover feed, and a personal Want to try / Trying / Using / Tried / Dropped shelf.
- Optional 1–5 star ratings and short notes attached to the exact version tried. Long discussion links to Reddit. No requirement for structured or verified outcomes.
- Profiles lead with setup favorites. Stats and boards remain accessible and independent; no setup-to-token causal comparison.
- In-app notifications for shared versions and first-ever monthly 1M/10M/100M token thresholds, with preferences and a silent historical baseline.
- Resend email queue implementation and opt-in preferences are present, but activation is postponed at Alberti's explicit request. See email-continuation.md.
- A copyable agent skill and Node helper inspect and save reproducible local setups; available from My setups and /skill.
- Annual rewind is a later traction-dependent item in later.md.

## Validation

- 292 tests passed: 11 contracts, 58 parsers, 16 CLI, 201 API, and 6 agent-helper tests.
- New integration checks cover private/public history, restoration, stale saves, follow feeds, exact-version ratings, monthly milestone deduplication, email retries, unsubscribe, and suppression after unpublishing.
- `pnpm lint`, `pnpm typecheck`, and the production build passed.
- Chromium and mobile WebKit passed the complete save → publish → compare → follow → rate → copy → restore → inbox flow against the production build and an isolated local database. Logged-out visitors could download the published file without accessing private history.
- The skill passed the skill-creator validator and its six helper tests.
- Browser checks also verified both skill copy modes, importing a bundle containing reproduction instructions, and downloading the rendered PNG setup card.
- Production deployment evidence will be recorded below after rollout.

## Release operations

Back up D1, apply migration 0026, deploy the Worker before web pages that call the new routes, and verify the public founder setup. Existing instructions are imported into private history; already public text is preserved as a shared snapshot. Email secrets stay unset until the deferred domain setup is complete.

- D1 backup saved outside the repository with owner-only permissions on 2026-09-29 UTC.
- Remote migration `0026_setup_history.sql` applied successfully (19 statements).
