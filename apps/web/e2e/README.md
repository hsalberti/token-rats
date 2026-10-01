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
pnpm --filter @token-rats/web e2e -- --project=firefox
pnpm --filter @token-rats/web e2e -- --project=mobile-webkit
```

`PLAYWRIGHT_WEB_BASE_URL=http://...` overrides the default `127.0.0.1:3000`.

`mobile-webkit` uses Playwright's iPhone profile on Linux WebKit. It catches
responsive layout, touch, viewport, and WebKit class issues, but it is still
not the same as driving Safari on a physical iPhone. For real-device checks,
start the local dev stack bound to your LAN and open the URL from the phone:

```sh
pnpm --filter @token-rats/api dev -- --ip 0.0.0.0 --port 8787
pnpm --filter @token-rats/web dev -- -H 0.0.0.0 -p 3000
hostname -I
```

Then visit `http://<linux-lan-ip>:3000` from the iPhone while it is on the same
Wi-Fi. Fully automated real-iPhone Safari checks from Ubuntu require a remote
device service or a Mac/iOS automation host.

## Spec inventory

| # | File | Status |
|---|---|---|
| 1 | `01-install-first-card.spec.ts` | partial — covers install snippet + share-card route; full CLI sync requires the wrangler harness |
| 2 | `02-signed-out-homepage.spec.ts` | **fully implemented** |
| 3 | `03-heatmap-range-toggle.spec.ts` | checks 4/12-week windows, responsive grids, PNG sharing, and activity links; uses a public profile or TOKEN_RATS_ACTIVITY_E2E_HANDLE |
| 4 | `04-room-stat-strip-streak.spec.ts` | scaffolded; needs wrangler harness |
| 5 | `05-org-soft-create.spec.ts` | scaffolded; needs wrangler harness |
| 6 | `06-admin-approval.spec.ts` | scaffolded; needs wrangler harness |
| 7 | `07-email-interstitial.spec.ts` | scaffolded; needs wrangler harness + GitHub OAuth network mock |
| 8 | `08-twitter-connect-disconnect.spec.ts` | scaffolded; needs wrangler harness + X OAuth network mock |
| 9 | `09-country-locked-groups.spec.ts` | partial — static `/groups` render check passes; seeded mismatch case scaffolded |
| 10 | `10-test-push-toast.spec.ts` | scaffolded; needs wrangler harness + push-service mock |
| 13 | `13-profile-share.spec.ts` | requires isolated social fixtures; edits profile instructions, copies selected lines, retries image generation, validates PNG download, native-share gesture/fallback, and anonymous share links |

See `_setup/wrangler-harness.ts` for the planned shape of the per-spec
D1 reset + seeding harness. The "scaffolded" specs are well-commented
stubs documenting the intended assertions.

### Profile sharing

`13-profile-share.spec.ts` uses the same isolated social fixtures as
`12-setup-history.spec.ts`: public `social-alice` and `social-bob` users and
the **local-only** signing key `social-local-test-only`. Apply all D1
migrations before seeding those users. Never point this test at a live database.

```sh
TOKEN_RATS_SOCIAL_E2E=1 \
PLAYWRIGHT_API_BASE_URL=http://127.0.0.1:8787 \
PLAYWRIGHT_WEB_BASE_URL=http://127.0.0.1:3000 \
pnpm --filter @token-rats/web exec playwright test 13-profile-share.spec.ts --project=chromium
```

The web server's `NEXT_PUBLIC_API_URL` must point at that same test API.
The spec saves the generated 1200×630 PNG and share-dialog screenshot in
Playwright's test output directory. The API regression suite in
`apps/api/src/routes/profile-share.test.ts` independently verifies the rolling
30-day totals, model/provider ranking, version selection, and visibility rules.

## CI

`.github/workflows/e2e.yml` runs the suite on Chromium, Firefox, desktop
WebKit, and mobile WebKit, gated on `paths:` `apps/web/**` and
`packages/contracts/**`. API-only or CLI-only PRs skip this job.
