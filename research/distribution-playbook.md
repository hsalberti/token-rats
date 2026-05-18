# The "Steinberger system": shipping macOS + CLI apps

**Research date:** 2026-05-18

The end-to-end playbook Steinberger uses across CodexBar, RepoBar, VibeTunnel, Peekaboo, Trimmy, BlackBar, and his Node CLIs. Reproducible end-to-end. Most scripts copy-paste directly.

## The meta-pattern (the 8 things that make it work)

1. **One personal Homebrew tap as the install pivot.** `steipete/homebrew-tap` hosts `Casks/` (Mac apps) and `Formula/` (CLIs) side by side. Single README documents every package. Single `update-formula.yml` workflow can be `workflow_dispatch`-called from any source repo.

2. **Releases run from a developer laptop, not from CI.** Signing key, Sparkle private key, and ASC API key live on the Mac. The source repo has `Scripts/release.sh` as the entry point. CI does lint + test only. The exception is VibeTunnel (bigger team, builds in CI but still defers notarization to scripted helpers). **Pros:** fewer secrets-in-Actions, faster iteration. **Cons:** can't release without your laptop.

3. **One master playbook (`agent-scripts/docs/RELEASING-MAC.md`) is the source of truth.** Every project's `docs/RELEASING.md` says "read this master file first and reconcile differences." It encodes the macOS tribal knowledge: Sparkle build-number monotonicity, `ditto --norsrc` to avoid AppleDouble files, `-spks/-spkd` Mach lookup exceptions for sandboxed apps, EdDSA key verification, "definition of done" checklist.

4. **Sparkle 2 is the universal updater.** Every Mac app uses Sparkle 2.x with EdDSA-signed **full** updates (no deltas — his master playbook says "Remove any `<sparkle:deltas>` blocks before publishing"). Appcast committed to the repo root, served from `raw.githubusercontent.com`. `SUPublicEDKey` hardcoded in Info.plist; private key lives in Dropbox/1Password.

5. **Sparkle is auto-disabled in Homebrew installs.** `InstallOrigin.isHomebrewCask(bundleURL)` checks if the bundle path contains `/Caskroom/`; if so, the AppDelegate swaps in a `DisabledUpdaterController` no-op. Brew users update via `brew upgrade --cask`. This avoids "two update mechanisms fighting."

6. **`stats-store` gives him privacy-first analytics via Sparkle's profiling without writing app code.** Switching from `https://raw.githubusercontent.com/.../appcast.xml` to `https://stats.store/api/v1/appcast/<app>.xml` is the entire integration. Tracks macOS version, CPU, app version, daily uniques — no IPs, no behavior. He has moved CodexBar off it (now points straight at GitHub raw), so treat as optional.

7. **Aggressive `zap trash:` lists in every cask.** Every cask enumerates every Containers/Preferences/Caches/HTTPStorages/WebKit/Application Scripts path it touches, so `brew uninstall --cask --zap` is a true factory reset. Formulae (CLIs) get a "Manual Cleanup" section in the tap README because `--zap` is cask-only.

8. **App-bundled CLI preferred over separate distribution.** When an app and a CLI share code, the CLI is built as a Swift product, copied to `<App>.app/Contents/Helpers/`, and the brew cask symlinks it via the `binary` stanza. One install → both binaries.

## The Homebrew cask pattern (CodexBar)

`Casks/codexbar.rb`:

```ruby
cask "codexbar" do
  version "0.27.0"
  sha256 "..."
  url "https://github.com/steipete/CodexBar/releases/download/v#{version}/CodexBar-macos-universal-#{version}.zip",
      verified: "github.com/steipete/CodexBar/"
  depends_on macos: ">= :sonoma"
  app "CodexBar.app"
  binary "#{appdir}/CodexBar.app/Contents/Helpers/CodexBarCLI", target: "codexbar"
  zap trash: [
    "~/Library/Application Support/com.steipete.codexbar",
    "~/Library/Preferences/com.steipete.codexbar.plist",
    "~/Library/Caches/com.steipete.codexbar",
    # ...11 more paths covering Containers, HTTPStorages, WebKit, Group Containers, Saved Application State
  ]
end
```

## The Node-CLI formula pattern (oracle)

`Formula/oracle.rb`:

```ruby
require "language/node"
class Oracle < Formula
  desc "..."
  homepage "..."
  url "https://github.com/steipete/oracle/releases/download/v0.5.0/oracle-0.5.0.tgz"
  sha256 "..."
  license "MIT"
  depends_on "node"
  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end
  test do
    assert_match version.to_s, shell_output("#{bin}/oracle --version")
  end
end
```

This is the pattern Token Rats's CLI should use to get a brew install path. See [`proposals.md`](./proposals.md).

## The cross-repo automated formula update workflow

`.github/workflows/update-homebrew.yml` in the source repo (e.g. Peekaboo):

```yaml
on:
  release:
    types: [published]
jobs:
  update-tap:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger tap workflow
        env:
          GH_TOKEN: ${{ secrets.TAP_DISPATCH_TOKEN }}
        run: |
          REQUEST_ID=$(uuidgen)
          gh workflow run update-formula.yml \
            --repo steipete/homebrew-tap \
            -f formula=peekaboo \
            -f tag=${{ github.event.release.tag_name }} \
            -f repository=openclaw/Peekaboo \
            -f macos_artifact=peekaboo-macos-universal.tar.gz \
            -f request_id=$REQUEST_ID
          # Watch the dispatched run
          sleep 5
          RUN_ID=$(gh run list --repo steipete/homebrew-tap \
            --workflow=update-formula.yml \
            --json databaseId,name,event,status,conclusion,createdAt \
            --jq ".[] | select(.name == \"update-formula\") | .databaseId" \
            | head -n 1)
          gh run watch $RUN_ID --exit-status --repo steipete/homebrew-tap
```

The tap's `update-formula.yml` calls a Python script (`update_formula.py`) that regex-rewrites `url` and `sha256` in the formula `.rb` and commits.

**This is forkable as-is. ~90% of formula update cases (single-URL, multi-arch via `artifact_template`, on_macos/on_linux blocks) are handled.**

## The release script (CodexBar's `Scripts/release.sh`)

The single-command release entry point:

```
./Scripts/release.sh
```

What it runs (sequentially, with checkpoints):
1. **Preflight** — clean git tree, monotonic build number, finalized `CHANGELOG.md` (no "Unreleased"), unique version not already in appcast
2. **Build** — `swift build -c release --arch arm64` + `--arch x86_64`, lipo, embed Sparkle.framework
3. **Sign** — deep + hardened-runtime + timestamp, sign frameworks/Autoupdate/Updater/XPCs from innermost out
4. **Notarize** — submit to `notarytool`, wait, staple
5. **Package** — `ditto --norsrc -c -k --keepParent` (never use `zip`/`unzip` — AppleDouble files break signature)
6. **Appcast** — `Scripts/make_appcast.sh <zip> <feed-url>` calls Sparkle's `generate_appcast` with `SPARKLE_PRIVATE_KEY_FILE`, embeds HTML release notes from `CHANGELOG.md` via `Scripts/changelog-to-html.sh`
7. **Publish** — `gh release create`, tag/push
8. **Dispatch tap** — trigger `update-formula.yml` and watch
9. **Verify** — `Scripts/check-release-assets.sh` and `Scripts/verify_appcast.sh`

The 5 helper scripts (`sign-and-notarize.sh`, `make_appcast.sh`, `changelog-to-html.sh`, `check-release-assets.sh`, `verify_appcast.sh`) are ~90% reusable across projects.

## Code signing setup

Required:
- **Apple Developer Program** ($99/yr)
- **Developer ID Application certificate** — for distribution outside the App Store
- **App Store Connect API key** — App Manager role (NOT Admin), `.p8` file kept in 1Password

Environment variables (live in `~/.zshrc` or 1Password CLI):
- `APP_STORE_CONNECT_KEY_ID`
- `APP_STORE_CONNECT_ISSUER_ID`
- `APP_STORE_CONNECT_API_KEY_P8` (path to `.p8`)

Sign with:
- `--deep` — recursively
- `--options runtime` — hardened runtime
- `--timestamp` — required by notarization
- Sign Sparkle.framework, Autoupdate, Updater, XPCs **explicitly** in innermost-first order

Best reference: https://github.com/steipete/VibeMeter/blob/main/docs/SIGNING-AND-NOTARIZATION.md

## Sparkle EdDSA appcast setup

Generate keypair:
```sh
generate_keys     # produces ed25519 public + private key
```

In Info.plist:
```xml
<key>SUFeedURL</key>
<string>https://raw.githubusercontent.com/<org>/<repo>/main/appcast.xml</string>
<key>SUPublicEDKey</key>
<string>AGCY8w5vHirVfGGDGc8Szc5iuOqupZSh9pMj/Qs67XI=</string>  <!-- public key, base64 -->
<key>SUEnableAutomaticChecks</key>
<true/>
<key>SUAutomaticallyUpdate</key>
<false/>
```

Beta channel: tag items with `sparkle:channel="beta"` in the appcast XML. App's "About" → "Update Channel" sets `allowedChannels` on the `SPUStandardUpdaterController`.

**No deltas.** Full ZIPs only.

## Sandboxed-app gotcha: the `-spks/-spkd` Mach lookup

If you sandbox the app and use Sparkle, you MUST add to entitlements:

```xml
<key>com.apple.security.temporary-exception.mach-lookup.global-name</key>
<array>
  <string>$(PRODUCT_BUNDLE_IDENTIFIER)-spks</string>
  <string>$(PRODUCT_BUNDLE_IDENTIFIER)-spki</string>
</array>
```

The master playbook flags this as the #1 Sparkle-in-sandbox gotcha. CodexBar avoids the issue by not sandboxing; VibeMeter sandboxes and includes these exceptions.

## Telemetry / analytics

- **Default: none.** Trimmy's `Telemetry.swift` is just `OSLog` `Logger` instances — local logging only. README explicitly states "No telemetry."
- **Optional: stats.store** for anonymous install / version counts via Sparkle's User-Agent profiling. One-line Info.plist change (point `SUFeedURL` at `https://stats.store/api/v1/appcast/<app>.xml`).
- **Never:** behavior tracking, third-party analytics SDKs.

## File references — copy these directly

| What | Source URL |
|---|---|
| Master playbook | https://github.com/steipete/agent-scripts/blob/main/docs/RELEASING-MAC.md |
| Sparkle + sandboxing notes | https://github.com/steipete/VibeMeter/blob/main/docs/RELEASE.md |
| Signing/notarization guide | https://github.com/steipete/VibeMeter/blob/main/docs/SIGNING-AND-NOTARIZATION.md |
| Brew cask example (Mac app + bundled CLI) | https://github.com/steipete/homebrew-tap/blob/main/Casks/codexbar.rb |
| Brew formula example (Node CLI) | https://github.com/steipete/homebrew-tap/blob/main/Formula/oracle.rb |
| Brew formula example (binary tarball) | https://github.com/steipete/homebrew-tap/blob/main/Formula/peekaboo.rb |
| Tap update-formula workflow | https://github.com/steipete/homebrew-tap/blob/main/.github/workflows/update-formula.yml |
| Tap update-formula Python rewriter | https://github.com/steipete/homebrew-tap/blob/main/.github/scripts/update_formula.py |
| Source-repo dispatch workflow | https://github.com/openclaw/Peekaboo/blob/main/.github/workflows/update-homebrew.yml |
| Multi-arch CLI build matrix | https://github.com/steipete/CodexBar/blob/main/.github/workflows/release-cli.yml |
| CodexBar Sparkle integration doc | https://github.com/steipete/CodexBar/blob/main/docs/sparkle.md |
| CodexBar packaging doc | https://github.com/steipete/CodexBar/blob/main/docs/packaging.md |
| CodexBar release checklist | https://github.com/steipete/CodexBar/blob/main/docs/RELEASING.md |
| App-bundled CLI installer (sudo via osascript) | https://github.com/steipete/CodexBar/blob/main/bin/install-codexbar-cli.sh |
| Brew-install detection (skip Sparkle) | https://github.com/steipete/CodexBar/blob/main/Sources/CodexBar/InstallOrigin.swift |
| Stats-store (optional Sparkle analytics) | https://github.com/steipete/stats-store |
| Full Welcome flow (reference, probably overkill) | https://github.com/amantus-ai/vibetunnel/blob/main/mac/VibeTunnel/Presentation/Views/WelcomeView.swift |
| CLIInstaller (sudo symlink + outdated detection) | https://github.com/amantus-ai/vibetunnel/blob/main/mac/VibeTunnel/Utilities/CLIInstaller.swift |

See [`proposals.md`](./proposals.md) for how to apply this to Token Rats — phased plan from "brew the existing CLI" to "ship a Mac menu-bar widget."
