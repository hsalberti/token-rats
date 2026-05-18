# Research: Peekaboo

**Research date:** 2026-05-18

- **Repo:** https://github.com/openclaw/Peekaboo (formerly `steipete/Peekaboo`)
- **Stars:** 4,359
- **License:** MIT
- **Platform:** macOS only (universal binary); also distributable as an MCP server via npm

## What it is

A macOS CLI + MCP server for screen capture, accessibility automation, and agentic GUI control. Combines a Swift CLI, an optional MCP server (`npx -y @steipete/peekaboo`), and a native agent. Uses Steinberger's `Commander` for parsing (declarative `@Option`/`@Argument`/`@Flag` wrappers), `Tachikoma` as the AI provider abstraction, and `AXorcist` for macOS Accessibility access.

**Not directly relevant to Token Rats's product space (screen automation vs. token tracking), but it is the canonical reference for:**
- macOS CLI distributed via both brew **and** npm
- Cross-repo automated Homebrew formula updates
- "One Swift core, three surfaces (CLI + Mac app + MCP server) via Commander"

## Tech stack

- Swift, macOS-only universal binary
- `steipete/Commander` for CLI argument parsing
- `openclaw/Tachikoma` for AI provider abstraction
- `openclaw/AXorcist` for macOS Accessibility wrapper
- TypeScript MCP server wrapper that shells out to the Swift binary

## Distribution — the cross-channel pattern

1. **`brew install steipete/tap/peekaboo`** — formula (not cask) installs a single signed universal binary from `peekaboo-macos-universal.tar.gz` on GitHub Releases
2. **`npx -y @steipete/peekaboo`** — MCP server entry point; the npm package ships a JS wrapper that resolves the binary path

**This is the pattern Token Rats should mimic for its CLI.** Already `npm install -g token-rats`; add a brew formula in a tap. See [`distribution-playbook.md`](./distribution-playbook.md).

## Auto-update

No Sparkle — it's a CLI, not a GUI app. Update via `brew upgrade` or `npm update -g`. No built-in self-update.

## First-run UX

The Homebrew formula's `caveats` block prints a multi-line message:
- Screen Recording permission instructions
- AI provider env var setup
- Pointer to `peekaboo config init`

Plus the binary has its own permission management commands:
- `peekaboo permissions status` — show current grants
- `peekaboo permissions grant` — request needed permissions

**Token Rats application:** the `token-rats` CLI's `init` / `login` flow can use similar caveats in the formula, plus a `token-rats doctor` (or `status`) command to diagnose log path access.

## The killer pattern — cross-repo automated formula updates

`.github/workflows/update-homebrew.yml` triggers on `release: published`:

```yaml
- name: Trigger homebrew-tap update
  run: |
    gh workflow run update-formula.yml \
      --repo steipete/homebrew-tap \
      -f formula=peekaboo \
      -f tag=${{ github.event.release.tag_name }} \
      -f repository=openclaw/Peekaboo \
      -f macos_artifact=peekaboo-macos-universal.tar.gz \
      -f request_id=$(uuidgen)
    # Then watch the dispatched run
    gh run watch <run-id> --exit-status
```

The tap repo (`steipete/homebrew-tap`) hosts a Python script (`update_formula.py`) that:
- Reads the formula `.rb` file
- Regex-rewrites `url` and `sha256` values
- Commits and pushes
- Optionally handles multi-arch via `artifact_template` parameter

**Why this matters:** Token Rats currently only has one distribution channel (npm). Adding brew means keeping the tap in sync. Steinberger's pattern is fully automatic — every release publishes, the source repo dispatches the tap's workflow, the tap updates the formula. Zero manual `.rb` edits. **This script is forkable as-is.**

## What to take for Token Rats

| Pattern | Token Rats application |
|---|---|
| Single Swift core → CLI + Mac app + MCP server via Commander | If Token Rats ever has a Mac widget, share data layer (probably reuse the npm CLI as a subprocess) |
| Brew formula installs single signed universal binary from tarball | Token Rats CLI is Node, so use the `oracle` formula pattern (`language/node` + `std_npm_args`) instead — but the dispatch workflow is identical |
| Cross-repo `update-formula.yml` via `gh workflow run` + `gh run watch` | Fork it. ~90% reusable. |
| `caveats` block in formula for permission/setup hints | Use for "run `token-rats login` to authenticate" |
| `peekaboo permissions status/grant` CLI subcommands | Add `token-rats doctor` to verify log path access, OAuth session validity, network reachability |

## Key file references

- Source repo dispatch workflow: https://github.com/openclaw/Peekaboo/blob/main/.github/workflows/update-homebrew.yml
- Tap update-formula workflow: https://github.com/steipete/homebrew-tap/blob/main/.github/workflows/update-formula.yml
- Tap Python rewriter: https://github.com/steipete/homebrew-tap/blob/main/.github/scripts/update_formula.py
- Peekaboo formula: https://github.com/steipete/homebrew-tap/blob/main/Formula/peekaboo.rb
- Commander (CLI parser): https://github.com/steipete/Commander
