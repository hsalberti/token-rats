import { Hono } from "hono";
import { Webhook } from "svix";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Env } from "../env.js";
import { signToken } from "../lib/auth.js";
import { upsertDeviceForIngest } from "../lib/ingest.js";
import {
  CAMPAIGN_ID,
  campaignReports,
  deliverReleaseEmails,
  prepareCampaign,
  recordCampaignActivity,
} from "../lib/release-campaigns.js";
import { testDatabase } from "../lib/test-db.js";
import type { AuthVariables } from "../middleware/auth.js";
import releases from "./releases.js";
import resendWebhook from "./resend-webhook.js";

let db: ReturnType<typeof testDatabase>;
const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
app.route("/releases", releases);
app.route("/webhooks/resend", resendWebhook);
beforeEach(() => {
  db = testDatabase();
  db.env.WEB_ORIGIN = "https://tokenrats.com";
  db.env.RESEND_API_KEY = "test-only";
  db.env.EMAIL_FROM = "Token Rats <updates@tokenrats.com>";
  db.env.RESEND_WEBHOOK_SECRET = `whsec_${Buffer.from("a test webhook signing secret").toString("base64")}`;
  db.db.prepare("UPDATE users SET email=? WHERE id='alice'").run("alice@example.com");
});
afterEach(() => {
  db.db.close();
  vi.restoreAllMocks();
});
async function request(path: string, user = "alice", method = "GET", body?: unknown) {
  return app.request(
    `https://test/releases${path}`,
    {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(user
          ? {
              Authorization: `Bearer ${await signToken(user, db.env.SESSION_SIGNING_KEY, 3600000)}`,
            }
          : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    },
    db.env,
  );
}
function recipient() {
  return db.db.prepare("SELECT * FROM campaign_recipients WHERE user_id='alice'").get() as {
    id: string;
    status: string;
    opened_at: number;
    provider_id: string;
  };
}
async function event(type: string, at = new Date().toISOString(), valid = true) {
  const payload = JSON.stringify({
    type,
    created_at: at,
    data: {
      email_id: "email-1",
      to: ["alice@example.com"],
      tags: { campaign: CAMPAIGN_ID, recipient: recipient().id },
    },
  });
  const timestamp = new Date();
  const id = "msg_test";
  return app.request(
    "https://test/webhooks/resend",
    {
      method: "POST",
      body: payload,
      headers: {
        "svix-id": id,
        "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
        "svix-signature": valid
          ? new Webhook(db.env.RESEND_WEBHOOK_SECRET!).sign(id, timestamp, payload)
          : "bad",
      },
    },
    db.env,
  );
}
it("claims the guide once across concurrent visits, persists dismissal, and keeps accounts separate", async () => {
  const results = await Promise.all([
    request("/visit", "alice", "POST"),
    request("/visit", "alice", "POST"),
  ]);
  const shows = await Promise.all(
    results.map(async (r) => ((await r.json()) as { show: boolean }).show),
  );
  expect(shows.sort()).toEqual([false, true]);
  await request("/dismiss", "alice", "POST");
  expect(
    ((await (await request("/visit", "alice", "POST")).json()) as { show: boolean }).show,
  ).toBe(false);
  expect(((await (await request("/visit", "bob", "POST")).json()) as { show: boolean }).show).toBe(
    true,
  );
  expect((await request("/visit", "", "POST")).status).toBe(401);
  expect(
    db.db.prepare("SELECT dismissed_at FROM release_views WHERE user_id='alice'").get(),
  ).toMatchObject({ dismissed_at: expect.any(Number) });
});
it("protects reporting and sending; snapshots email eligibility once", async () => {
  expect((await request("/campaigns/report")).status).toBe(403);
  expect((await request("/campaigns/start")).status).toBe(403);
  db.db.prepare("UPDATE users SET email='ALICE@example.com' WHERE id='bob'").run();
  await request("/campaigns/prepare", "moderator", "POST");
  let report = (await campaignReports(db.env))[0]!;
  expect(report).toMatchObject({
    audienceTotal: 3,
    recipients: 1,
    missingEmail: 1,
    excluded: 1,
    sent: 0,
  });
  db.db.prepare("UPDATE users SET email='later@example.com' WHERE id='moderator'").run();
  await prepareCampaign(db.env);
  report = (await campaignReports(db.env))[0]!;
  expect(report.recipients).toBe(1);
});
it("honors unsubscribes without letting GET mail scanners change preferences", async () => {
  await prepareCampaign(db.env);
  const id = recipient().id;
  expect((await request(`/unsubscribe/${id}`, "")).status).toBe(200);
  expect(
    ((await (await request("/preferences")).json()) as { productEmails: boolean }).productEmails,
  ).toBe(true);
  await request(`/unsubscribe/${id}`, "", "POST");
  expect(
    ((await (await request("/preferences")).json()) as { productEmails: boolean }).productEmails,
  ).toBe(false);
  expect(recipient().status).toBe("cancelled");
  expect(db.db.prepare("SELECT COUNT(*) AS n FROM email_suppressions").get()).toEqual({ n: 1 });
  await request("/preferences", "alice", "PUT", { productEmails: true });
  expect(db.db.prepare("SELECT COUNT(*) AS n FROM email_suppressions").get()).toEqual({ n: 0 });
});
it("counts server-confirmed new trackers and visits within 30 days, keeping click timing separate", async () => {
  await prepareCampaign(db.env);
  await upsertDeviceForIngest(db.env, "alice", "device-before-send", "0.5.0", 0);
  expect((await campaignReports(db.env))[0]?.newUsage).toBe(0);
  const now = Date.now();
  db.db
    .prepare("UPDATE campaign_recipients SET status='sent',sent_at=?,clicked_at=?")
    .run(now - 1000, now - 500);
  await upsertDeviceForIngest(db.env, "alice", "device-after-send", "0.5.0", 0);
  await request("/visit", "alice", "POST");
  await recordCampaignActivity(db.env, "alice", "setup");
  expect((await campaignReports(db.env))[0]).toMatchObject({
    newUsage: 1,
    newUsageAfterClick: 1,
    newSetup: 1,
    returned: 1,
    returnedAfterClick: 1,
  });
  await upsertDeviceForIngest(db.env, "alice", "device-after-send", "0.5.0", 0);
  expect((await campaignReports(db.env))[0]?.newUsage).toBe(1);
  db.db
    .prepare("UPDATE campaign_recipients SET usage_at=NULL,sent_at=?")
    .run(now - 31 * 86_400_000);
  await upsertDeviceForIngest(db.env, "alice", "device-after-window", "0.5.0", 0);
  expect((await campaignReports(db.env))[0]?.newUsage).toBe(0);
});
it("verifies provider signatures, handles events before send response, deduplicates opens and suppresses bounces", async () => {
  await prepareCampaign(db.env);
  expect((await event("email.opened", undefined, false)).status).toBe(400);
  expect(recipient().opened_at).toBeNull();
  const at = new Date(Date.now() - 1000).toISOString();
  expect((await event("email.opened", at)).status).toBe(200);
  await event("email.opened", at);
  await event("email.delivered", at);
  expect((await campaignReports(db.env))[0]).toMatchObject({ sent: 1, opened: 1, delivered: 1 });
  expect(recipient().provider_id).toBe("email-1");
  await event("email.bounced");
  expect(db.db.prepare("SELECT reason FROM email_suppressions").get()).toEqual({
    reason: "email.bounced",
  });
  await request("/preferences", "alice", "PUT", { productEmails: true });
  expect(db.db.prepare("SELECT COUNT(*) AS n FROM email_suppressions").get()).toEqual({ n: 1 });
});
it("sends the snapshotted campaign idempotently and never starts on its own", async () => {
  await prepareCampaign(db.env);
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(JSON.stringify({ id: "email-1" }), { status: 200 }));
  expect((await deliverReleaseEmails(db.env)).sent).toBe(0);
  await request("/campaigns/start", "moderator", "POST");
  const results = await Promise.all([deliverReleaseEmails(db.env), deliverReleaseEmails(db.env)]);
  expect(results.reduce((sum, r) => sum + r.sent, 0)).toBe(1);
  expect(fetcher).toHaveBeenCalledTimes(1);
  const options = fetcher.mock.calls[0]![1]!;
  expect(options.headers).toMatchObject({ "Idempotency-Key": `release-${recipient().id}` });
  const body = JSON.parse(String(options.body));
  expect(body.html).toContain(`/v1/releases/email/${recipient().id}`);
  expect(body.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  expect((await campaignReports(db.env))[0]).toMatchObject({ status: "complete", sent: 1 });
  await request("/campaigns/start", "moderator", "POST");
  await deliverReleaseEmails(db.env);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("rechecks opt-outs before delivery and stops retries before provider idempotency expires", async () => {
  await prepareCampaign(db.env);
  await request("/campaigns/start", "moderator", "POST");
  db.db
    .prepare("UPDATE campaign_recipients SET first_attempt_at=?,attempts=1")
    .run(Date.now() - 24 * 86_400_000);
  const fetcher = vi.spyOn(globalThis, "fetch");
  await deliverReleaseEmails(db.env);
  expect(fetcher).not.toHaveBeenCalled();
  expect(recipient().status).toBe("failed");
  db.db
    .prepare("UPDATE campaign_recipients SET status='pending',first_attempt_at=NULL,attempts=0")
    .run();
  db.db.prepare("UPDATE release_campaigns SET status='sending'").run();
  await request("/preferences", "alice", "PUT", { productEmails: false });
  await deliverReleaseEmails(db.env);
  expect(fetcher).not.toHaveBeenCalled();
  expect(recipient().status).toBe("cancelled");
});
