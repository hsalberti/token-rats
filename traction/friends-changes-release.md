# Inline changes, kudos, and automatic friends-only history

Release date: 2026-09-29. CLI: 0.5.0. Deployment evidence is recorded below after verification.

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
- Public repository verified at https://github.com/hsalberti/token-rats. Production rollout is in progress; final commit, deployment, and registry evidence follow here.
