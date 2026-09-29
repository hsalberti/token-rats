# Inline changes, kudos, and automatic friends-only history

Shipped and verified on 2026-09-29. CLI: 0.5.0. Web: https://tokenrats.com.

## Scope

- Feed cards lead with line additions/removals and one line of neighboring context. Large changes link to the full comparison. Private history is never used to generate a diff for someone who cannot read it.
- Kudos belong to a particular version and can be undone. Owners cannot give themselves kudos.
- Friends share a private board or follow each other. One-way follows show public updates. Public board membership alone does not grant friends-only access.
- Audiences are explicit: Only me, Friends only, Public. Private profiles can share friends-only versions without exposing their usage stats. Direct version links, profile instructions, feeds, cards, shelves, and notifications enforce the same audience.
- `npx token-rats@latest setup-track` previews Codex/OpenCode global instructions (or a supplied path), asks once, and enables automatic friends-only history. Existing CLI installations do not opt in automatically.
- The background tracker coalesces rapid edits, retries the latest saved content after failures, skips duplicates, and handles atomic saves. This records saved snapshots, not every keystroke or every intermediate offline edit.
- My setups shows capture status, errors, history, pause, and resume. Pausing retains saved history. The owner can hide versions or delete the setup. Common credential patterns and private markers are excluded; the preview still needs review.

Email activation remains postponed per Alberti. No email campaign or external social post is sent by this release.

## Announcement draft — email (hold until email activation)

Subject: The one line your friend changed

Token Rats now shows the added and removed lines directly in your feed. Give kudos to a change, open its history, or try that version in your own setup.

You can also keep your global AGENTS.md history automatically. Run `npx token-rats@latest setup-track`, review the preview, and enable friends-only sharing. Your friends are people on a common private board or people you follow who follow you back. Pause at any time in My setups; saved versions keep their audience.

Try it: https://tokenrats.com/app/setups#automatic

## LinkedIn / founder update draft

The most interesting part of someone’s agent setup is often the line they just changed.

I added inline diffs and kudos to Token Rats. A small edit looks like a small edit: a green addition, a red removal, and enough context to understand it.

There is also an opt-in CLI watcher for global AGENTS.md. Future saved edits go to friends only — mutual follows or a shared private board. It keeps a history you can revisit, and you can pause it from the app.

What is one instruction you removed after trying it?

I maintain Token Rats. Source: https://github.com/hsalberti/token-rats

## Community follow-up draft

I maintain Token Rats, an open source home for agent setup histories and local usage tracking. This update adds inline AGENTS.md diffs, kudos, and optional automatic friends-only capture from local files.

I’m interested in the edits that did not work out too. What instruction did you try, remove, and decide to leave out?

Use this as a reply in an existing relevant conversation or the next permitted showcase thread. Recheck venue rules and current threads using [ongoing-outreach.md](ongoing-outreach.md) before posting. Alberti edits and posts manually. Avoid presenting this as evidence that a setup change caused a usage change.

## Verification and deployment

- Lint and typecheck passed across all workspaces; production web and CLI builds passed.
- 321 unit/integration tests passed (21 contracts, 58 parsers, 20 CLI, 215 API, 7 skill helper). A parallel test run initially exhausted worker startup time on the development machine; the complete suite passed with two workers per package.
- Six browser scenarios passed in desktop Chromium and mobile Chromium: histories/restoration/reviews, profile instructions/share cards, and inline diffs/kudos/friends/capture controls. WebKit could not start because this host lacks its image libraries; no Safari result is claimed.
- A clean installation of the inspected 0.5.0 archive previewed and registered a synthetic file against an isolated local API, captured an actual edit exactly once as friends-only, and paused from the CLI. No real instruction files were enabled.
- Public repository verified at https://github.com/hsalberti/token-rats. The completed rollout is recorded below.

### Published artifacts

- Public feature commit: [`269e76729c09bfe163bae7e77a3fbd9b477985e5`](https://github.com/hsalberti/token-rats/commit/269e76729c09bfe163bae7e77a3fbd9b477985e5).
- npm accepted `token-rats@0.5.0` and the registry now serves it as `latest`. Publishing used the token stored in BWS; no account approval was needed.
- D1 was exported to a private SQL backup outside the repository (19,784,739 bytes) before migration 0028. Cloudflare OAuth export failed; the BWS deployment token and continuous polling completed the backup.
- Migration 0028 applied successfully. Initial production Worker version: `6cc27adf-7d83-4fcb-be9f-c2fce65ac113`.
- Live API: health passed; the authenticated feed returns diff previews, the Friends directory reflects the current connections, and capture status works. Email configuration remains disabled. No real instruction files were enabled on Alberti’s machine.
- Deployed web/API configuration commit: [`d505e35898f85139d169f08c69cd2e22a690dee7`](https://github.com/hsalberti/token-rats/commit/d505e35898f85139d169f08c69cd2e22a690dee7). Pages production deployment `3724e20d-4d63-4c9f-8be0-5095ea71ec30` succeeded. The preceding feature deployment `5957ae48-538c-4a18-b5c0-8ed7c31b50d2` also succeeded.
- Final Worker version: `455061a8-ba62-499b-9b09-244c4f85583c`. [Deploy run 36585146568](https://github.com/hsalberti/token-rats/actions/runs/36585146568) succeeded; `/healthz` returned 200 and `/v1/cli/version` advertises 0.5.0.
- [CI for the feature](https://github.com/hsalberti/token-rats/actions/runs/36584800347), [CI for the advertised version](https://github.com/hsalberti/token-rats/actions/runs/36584975952), lint, and [the existing browser smoke matrix](https://github.com/hsalberti/token-rats/actions/runs/36584800378) all passed. Authenticated feature coverage was run separately against the isolated database as described above.
- Production browser checks passed in desktop and mobile Chromium: feed tabs, diff cards, capture onboarding, Friends directory, no browser exceptions, and no horizontal overflow on the capture page.
- A clean registry installation reports 0.5.0; its executable matches the locally verified release build byte for byte. The no-account preview worked. npm `gitHead` is the public feature commit `269e76729c09bfe163bae7e77a3fbd9b477985e5`; tarball SHA-1 is `8591baa40aece8663d98873c5f638a3b4ace494d`.
- GitHub release: https://github.com/hsalberti/token-rats/releases/tag/v0.5.0. Registry: https://www.npmjs.com/package/token-rats/v/0.5.0.

### Remaining actions

No release blocker remains. Alberti can enable capture on his own machine with `npx token-rats@latest setup-track` after reviewing the preview. Email remains deferred in [email-continuation.md](email-continuation.md), and outreach drafts remain for Alberti to edit and post. Annual rewind is still a traction-dependent idea in [later.md](later.md).
