import { test } from "@playwright/test";

/**
 * Spec 6: Admin approval.
 *
 * Admin user (seeded via `ADMIN_GITHUB_LOGIN`) searches pending orgs and
 * clicks Approve; member-only endpoints unblock.
 *
 * BLOCKED on the wrangler harness — needs to seed an admin user, a pending
 * org owned by a different user, and to verify the approval state change.
 */

test.skip(true, "Needs wrangler harness with admin-user seeding.");

test("admin sees pending orgs and can approve from /admin", async ({}) => {
  // INTENDED:
  //   - Seed admin user (login matches ADMIN_GITHUB_LOGIN env var) + sign in.
  //   - Seed pending org owned by a different user.
  //   - Visit /admin → assert "Pending orgs" section + the test org's row.
  //   - Click Approve → confirm dialog → assert row disappears.
  //   - Re-query /v1/orgs/<slug> as the founder → assert status='approved'.
});
