import { test } from "@playwright/test";

/**
 * Spec 7: Email capture interstitial.
 *
 * A pre-scope-bump user (email = NULL, no `tr_email_reauth_seen` cookie)
 * is redirected once through GitHub OAuth on first page load. After the
 * callback the cookie is set and `users.email` is populated; no re-redirect
 * on the next visit.
 *
 * BLOCKED on the wrangler harness + GitHub OAuth network mocking. The
 * interstitial flow involves a 3-way bounce (web → API → github.com →
 * API → web) that needs the request layer stubbed.
 */

test.skip(true, "Needs wrangler harness + GitHub OAuth network mock.");

test("pre-deploy user is redirected once through GitHub on first page load", async () => {
  // INTENDED:
  //   - Seed user with email = NULL, signed up before the scope-bump deploy date.
  //   - Mint a session cookie for that user.
  //   - Mock https://github.com/login/oauth/authorize to redirect back to
  //     /v1/auth/github/callback with a canned access token.
  //   - Mock https://api.github.com/user and /user/emails.
  //   - Navigate to /app.
  //   - Assert one round-trip through the OAuth flow.
  //   - Assert the tr_email_reauth_seen cookie is present after redirect.
  //   - Re-navigate to /app — assert no second OAuth bounce.
});
