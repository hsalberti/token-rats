# Deferred roadmap

Tasks deliberately punted out of the active roadmap. Captured here so they're
not forgotten when we revisit the install / onboarding surface.

## Node-free install path for the CLI

**Problem.** `npx token-rats …` assumes Node is on `PATH`. Non-developer
users (most commonly on macOS) hit "command not found: npx" immediately —
see the `NodeInstallHint` component for the in-page mitigation we shipped.
The mitigation is a polite signpost, not a fix; the user still has to
install a runtime before they can sync.

**Goal.** Let a user install and run `token-rats` without first installing
Node themselves.

**Options to evaluate:**

- **Homebrew tap** (`brew install token-rats/tap/token-rats`). Ship a
  prebuilt single-file binary (Bun or pkg/esbuild + node18 SEA) for
  `darwin-arm64`, `darwin-x64`, `linux-x64`, `linux-arm64`. macOS is the
  priority since that's where the gap was reported.
- **`curl … | sh` installer** mirroring the binary, for users without
  Homebrew. Same prebuilt artefacts as the tap.
- **Windows: winget / Scoop manifest** pointing at the same release
  artefacts.
- **GitHub Releases** as the source of truth for the binaries, built by a
  release workflow alongside the npm publish.

**Open questions:**

- Does the CLI's filesystem-walking code (Claude Code + Cursor log
  discovery) work cleanly under a SEA / Bun single-file build? Worth a
  spike before committing.
- Signing/notarisation on macOS — needed to avoid Gatekeeper noise. Cost
  + cert ownership TBD.
- How do we keep the npm-distributed CLI and the binary in version
  lockstep without doubling the release surface?

**Why deferred.** Real build-pipeline + release-infra work. The
`NodeInstallHint` covers the immediate UX bleed for ~2 lines of code; the
binary path is worth doing properly when we have a stretch to spend on
release engineering.

## Pro-tier org Stripe checkout email on approval

**Problem.** When an admin approves a `pro`-tier org via the v1.2 soft-create
flow, we flip status → `approved` and plan → `pro`, but we don't trigger a
Stripe checkout session or email the founder a payment link. They have a
green org with no billing path.

**Why deferred.** Billing isn't wired yet — `apps/api/src/lib/email.ts` is a
stub, the Resend account is uncreated, and the Stripe SDK paths in
`stripe.ts` are tested but unused. Sending an outbound email + creating a
checkout session both depend on those landing first.

**When to revisit.** When the weekly digest / email-capture cron from the
deferred "automated email sending" entry is ready — same Resend wiring
unlocks both surfaces.
