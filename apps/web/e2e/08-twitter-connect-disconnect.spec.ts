import { test } from "@playwright/test";

/**
 * Spec 8: Twitter connect / disconnect.
 *
 * Connect X → OAuth round-trip (stub X at the network layer for this spec
 * only) → pill renders on /u/[handle], /r/[code] member list, friends view.
 * Disconnect → pill disappears everywhere.
 *
 * BLOCKED on the wrangler harness + X OAuth network mocking. Pill rendering
 * itself is covered indirectly by the live `/u/[handle]` spec — the harness
 * piece is the OAuth round-trip.
 */

test.skip(true, "Needs wrangler harness + X OAuth network mock.");

test("connect X flow populates twitter_handle, pill renders, disconnect clears it", async () => {
  // INTENDED:
  //   - Mock https://twitter.com/i/oauth2/authorize → 302 back to our callback.
  //   - Mock https://api.twitter.com/2/oauth2/token → { access_token: 'x' }.
  //   - Mock https://api.twitter.com/2/users/me → { data: { id: '1', username: 'fixture' } }.
  //   - Authed user clicks Connect X on /settings/profile.
  //   - Assert TwitterHandlePill appears with @fixture.
  //   - Assert /u/<user-handle> shows the pill.
  //   - Assert /r/<seeded-room> member list shows the pill.
  //   - Click Disconnect X → assert pill disappears + GET /v1/me returns null handle.
});
