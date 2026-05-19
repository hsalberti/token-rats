import { test } from "@playwright/test";

/**
 * Spec 10: Test-push toast.
 *
 * `/settings/notifications` "Send test push" hits the real wrapper;
 * mocked push service returns 201; UI shows the success toast.
 * Subscription invalidation path uses a mocked 410 to assert the row gets
 * hard-deleted.
 *
 * BLOCKED on the wrangler harness — needs to seed a push_subscriptions
 * row + mock fcm.googleapis.com / equivalent push endpoint at the
 * network layer.
 */

test.skip(true, "Needs wrangler harness + mocked push service endpoint.");

test("success path: 201 from push service → green toast", async () => {
  // INTENDED:
  //   - Seed authed user + a push_subscriptions row pointing at a mocked endpoint.
  //   - Mock the push endpoint to return 201.
  //   - Click "Send test push" on /settings/notifications.
  //   - Assert success toast.
});

test("invalidation path: 410 from push service → row hard-deleted", async () => {
  // INTENDED:
  //   - Same setup but the mock returns 410.
  //   - Click "Send test push".
  //   - GET /v1/notifications/subscriptions → assert no row remains for this user.
});
