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

**Problem.** Approving a pro-tier org today just flips `orgs.status` to
`'approved'` — the founder gets the same end state as a student-tier org
and no billing is collected. That's fine for the soft-launch (we're not
turning on Stripe yet) but it's the missing half of the "pro" tier.

**Goal.** When admin approves an org whose `requested_plan='pro'`, send the
founder a Stripe Checkout link via Resend (or wire a one-time link in the
approval response). On successful checkout, set `orgs.plan='pro'` and
populate `stripe_customer_id` / `stripe_subscription_id`.

**Why deferred.** Mission.md keeps paid features "architected for, not
built" until the student-tier cohort gives D7 retention signal. Wiring
Stripe checkout + the webhook handler for org subscriptions is real work
that we shouldn't do until we know there's demand. The soft-create flow
already records `requested_plan`, so this is purely additive when we
revisit.

## Automated email sending (Resend + weekly digest + unsubscribe)

**Problem.** `users.email` is now captured (see the shipped email-capture
feature) but nothing actually sends mail. `apps/api/src/lib/email.ts` is
still a stub that logs the intent; `apps/api/src/scheduled.ts` is an
explicit no-op. The Monday `0 16 * * 1` cron in `wrangler.toml` runs and
returns immediately. Until this lands, any outreach is done manually
against the captured email list.

**Goal.** Deliver the weekly digest (and any future transactional emails)
via a real ESP, with a working unsubscribe link.

**Scope to revisit:**

- **Resend wiring.** Replace `sendEmail` stub with a real Resend call.
  Decide on sandbox vs verified domain (the recommendation is
  `noreply@tokenrats.com` with full SPF + DKIM + DMARC for inbox
  placement).
- **Cron handler.** Restore `runWeeklyDigests` to iterate users with an
  email + a non-empty 7-day rollup, call `buildWeeklyDigest`, and send.
  Replace the sequential `await sendEmail` loop with a Cloudflare Queues
  fan-out before this scales past a few hundred users.
- **Unsubscribe.** Add `POST /v1/notifications/unsubscribe?token=<signed>`
  (HMAC over `(user_id, scope)`) that flips a notification preference
  bit. v1 is link-only — no `/settings/notifications` toggle to manually
  re-subscribe; revisit if the lack of a manual flip causes confusion.
- **Notification preferences schema.** Either a single
  `users.email_unsubscribed_at` timestamp (coarse) or a
  `user_notification_prefs` table keyed on `(user_id, category)`. The
  current notifications routes don't have an email category yet.

**Why deferred.** The user prefers to send outreach manually from the
captured list until there's a clear digest worth automating. Email
deliverability + domain verification work is real, and shipping a
half-working digest is worse than no digest. Capture-only ships first;
sending follows once the audience is large enough to be worth a real
ESP integration.
