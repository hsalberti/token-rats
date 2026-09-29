# Setup history release

Status: shipped to production on 2026-09-29 UTC. Email activation remains postponed.

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
- The updated homepage smoke checks passed all 12 cases across Chromium, Firefox, desktop WebKit, and mobile WebKit against production.

## Release operations

Back up D1, apply migration 0026, deploy the Worker before web pages that call the new routes, and verify the public founder setup. Existing instructions are imported into private history; already public text is preserved as a shared snapshot. Email secrets stay unset until the deferred domain setup is complete.

- D1 backup saved outside the repository with owner-only permissions on 2026-09-29 UTC.
- Remote migration `0026_setup_history.sql` applied successfully (19 statements).

## Production verification — 2026-09-29

- Feature source: public commit [`48f1889209942e6e0e137c5443dddf0a422f2e42`](https://github.com/hsalberti/token-rats/commit/48f1889209942e6e0e137c5443dddf0a422f2e42). Subsequent release-record and smoke-test changes do not change application behavior.
- Cloudflare Pages deployment `584eab38-a42a-49e1-9ecb-18a990b212f1` succeeded for that commit at https://tokenrats.com.
- [CI run 36557993489](https://github.com/hsalberti/token-rats/actions/runs/36557993489) passed lint, type checks, tests, and builds. [API deploy run 36558135874](https://github.com/hsalberti/token-rats/actions/runs/36558135874) passed migrations, deployment, and the deep health probe.
- `/healthz` reports healthy database and KV. Public setup discovery, the founder setup, and its public history return 200; the founder's private checkpoint returns 404 without authentication.
- Live Chromium and mobile WebKit checks passed the public profile, timeline, and skill page, plus authenticated Feed, My setups, Inbox, Stats, and Boards. Neither browser reported page errors.
- The public setup card returns a PNG. The live SKILL.md and Node helper match the public repository files byte for byte.
- The authenticated preferences API reports `emailConfigured: false`. In-app notifications work; email activation and campaigns remain deferred. No external social posts or customer emails were sent.

## Open the release

- [Agent skill](https://tokenrats.com/skill): copy the instructions or download SKILL.md, then paste into a coding agent.
- [My setups](https://tokenrats.com/app/setups): version history, import, and capture entry point.
- [Founder profile](https://tokenrats.com/u/hsalberti): the approved global-instruction excerpt is featured.
- [Following feed](https://tokenrats.com/app) and [notification inbox](https://tokenrats.com/app/notifications).

Automatic watching/publication of selected global AGENTS.md files and the annual setup rewind remain future work in [later.md](later.md). Sender verification and email activation resume from [email-continuation.md](email-continuation.md).
