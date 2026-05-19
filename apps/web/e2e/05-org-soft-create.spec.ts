import { test } from "@playwright/test";

/**
 * Spec 5: Soft-create org flow.
 *
 * POST /v1/orgs → 201 → `/o/<slug>/pending` renders confirmation + editable
 * name/email form; second create from the same user → 409 with the
 * existing slug in details.
 *
 * BLOCKED on the wrangler harness — needs an authed user we can mint a
 * session for. Skipped until the harness lands (see _setup/wrangler-harness.ts).
 */

test.skip(true, "Needs wrangler harness with authed-session minting.");

test("soft-create returns 201 + redirects to /o/[slug]/pending", async ({}) => {
  // INTENDED:
  //   - Boot harness, seed an authed user.
  //   - POST /v1/orgs { name, slug, founderEmail, requestedPlan: 'free' } with cookie.
  //   - Assert 201.
  //   - Visit /o/<slug>/pending — assert "You're on the waitlist" header.
});

test("second create from same user returns 409 referencing existing slug", async ({}) => {
  // INTENDED:
  //   - Same setup; first POST succeeds.
  //   - Second POST → 409 with details.existingSlug === the first slug.
});
