---
name: share-token-rats-setup
description: Inspect the user's agent instructions, tools, and coordination workflow, then save or share a reproducible setup version on Token Rats. Use when the user asks to capture, update, or publish their agent setup.
---

# Share a Token Rats setup

Help the user keep a useful snapshot of how their agents work. Finish with a saved Token Rats version and its URL, or an importable JSON bundle if account access is unavailable.

## Inspect what actually exists

Start with the active project and the user's global agent instruction locations. Follow the configuration paths the installed tools actually use; check environment overrides and file references. Common starting points include `AGENTS.md`, `CLAUDE.md`, `~/.codex/AGENTS.md`, `~/.claude/CLAUDE.md`, and the user's OpenCode configuration directory. For Paseo, Orca, or a custom handler, inspect its instruction/coordination configuration and public repository when available. Read only the parts needed to describe the setup.

Capture the effective instructions and their scope (global, project, or role). Record tools and observed versions, agents/models and roles, handoff/review steps, and any custom handler's public source URL. Explain how another person could reproduce the setup: prerequisites, where each included file belongs, required placeholders, and what remains user-specific. Put this in a `SETUP.md` file inside the bundle. Installed tools do not prove the user actively uses them; distinguish observed configuration from their stated preferences. Do not infer paid subscriptions from model access.

Preserve selected instruction text accurately. Remove credentials, private endpoints/repository names, personal paths, and unrelated private details; use named placeholders where necessary to make reproduction possible. Include whole files or coherent excerpts according to the user's scope. Leave chat transcripts, environment files, credential stores, and unrelated configuration out of the bundle. If a value is unknown, omit it or mark it unknown. A setup can be experimental or abandoned; do not invent outcomes or relate instruction changes to token consumption.

## Prepare one snapshot

Write `token-rats-setup.json` with this shape:

```json
{
  "name": "Everyday coding",
  "bundle": {
    "files": [
      {"name": "AGENTS.md", "content": "The selected, sanitized instructions"},
      {"name": "SETUP.md", "content": "Scope, observed versions, prerequisites, file placement, reproduction steps, and placeholders"}
    ],
    "workflow": "Who plans, implements, reviews, and how they hand off",
    "tools": "Tools and public custom-handler links",
    "models": "Configured model identifiers and roles; distinguish defaults from overrides",
    "subscriptions": "Only plans the user chose to include; otherwise leave empty"
  },
  "note": "What changed or why this experiment was kept or dropped",
  "verdict": "experiment"
}
```

Use `experiment`, `using`, or `retired` for verdict. Limits: 100-character name, up to 10 uniquely named text files, 20,000 characters per file and 100,000 across files, 5,000 for workflow, 2,000 each for tools/models/subscriptions/note. Use plain filenames without directories. Preserve a local mapping of original paths if useful; publish only generic file placement instructions.

Show the user a concise inventory and any unresolved reproduction requirements. Saving is private by default. If they explicitly asked to publish/share the inspected setup, that authorizes publication of the sanitized snapshot within that scope. Otherwise save privately and give them its review link. Never interpret a request to investigate as permission to make files public. An update gets a new version; do not overwrite the user's local configuration.

## Save with the bundled helper

The script lives at `scripts/save-setup.mjs` beside this skill. If using this document directly from the website, download it from `https://tokenrats.com/skills/share-token-rats-setup/scripts/save-setup.mjs` to a temporary directory and inspect it before executing.

```sh
node save-setup.mjs token-rats-setup.json --dry-run
node save-setup.mjs token-rats-setup.json
# Only for an explicitly requested public share:
node save-setup.mjs token-rats-setup.json --publish
```

Use Node.js 22.13 or newer. The helper uses the existing Token Rats CLI session from the OS configuration directory; it never prints the credential. If sign-in is missing/expired, run `npx token-rats@latest login --no-daemon` and let the user complete the browser login. Do not enable usage collection just to save a setup. A private profile must be made public by its owner at `https://tokenrats.com/settings/profile` before publication.

The helper finds an existing setup by exact name, saves the next version, and skips an identical snapshot. To select an existing setup explicitly, add `--setup SETUP_ID`. If the request result is uncertain, inspect My setups before retrying; do not blindly create another snapshot. A stale-version conflict requires re-reading the latest version before deciding how to incorporate it.

Return the saved URL, publication state, files included, and any omitted requirements. The user can download files, compare versions, restore history, feature the setup, or share its card from that page. Longer discussion belongs on r/TokenRats; this skill does not post to external social accounts.
