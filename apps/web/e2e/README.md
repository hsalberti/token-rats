# `apps/web/e2e` — Playwright smoke suite

Runbook for the v1.2 feature #8 smoke specs.

## Local quickstart

```sh
# One-time: install Playwright browsers.
pnpm --filter @token-rats/web e2e:install

# In two shells (or via `pnpm dev` at repo root):
pnpm --filter @token-rats/api dev   # Worker on :8787
pnpm --filter @token-rats/web dev   # Next on :3000

# In a third shell, run the suite:
pnpm --filter @token-rats/web e2e
# Or one project:
pnpm --filter @token-rats/web e2e -- --project=chromium
```

`PLAYWRIGHT_WEB_BASE_URL=http://...` overrides the default `127.0.0.1:3000`.

## Spec inventory

| # | File | Status |
|---|---|---|
| 1 | `01-install-first-card.spec.ts` | partial — covers install snippet + share-card route; full CLI sync requires the wrangler harness |
| 2 | `02-signed-out-homepage.spec.ts` | **fully implemented** |
| 3 | `03-heatmap-range-toggle.spec.ts` | runs opportunistically against a public profile; skips when none seeded |
| 4 | `04-room-stat-strip-streak.spec.ts` | scaffolded; needs wrangler harness |
| 5 | `05-org-soft-create.spec.ts` | scaffolded; needs wrangler harness |
| 6 | `06-admin-approval.spec.ts` | scaffolded; needs wrangler harness |
| 7 | `07-email-interstitial.spec.ts` | scaffolded; needs wrangler harness + GitHub OAuth network mock |
| 8 | `08-twitter-connect-disconnect.spec.ts` | scaffolded; needs wrangler harness + X OAuth network mock |
| 9 | `09-country-locked-groups.spec.ts` | partial — static `/groups` render check passes; seeded mismatch case scaffolded |
| 10 | `10-test-push-toast.spec.ts` | scaffolded; needs wrangler harness + push-service mock |

See `_setup/wrangler-harness.ts` for the planned shape of the per-spec
D1 reset + seeding harness. The "scaffolded" specs are well-commented
stubs documenting the intended assertions.

## CI

`.github/workflows/e2e.yml` runs the suite on Chromium + WebKit, gated on
`paths:` `apps/web/**` and `packages/contracts/**`. API-only or CLI-only
PRs skip this job.
