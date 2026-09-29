import { Hono } from "hono";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Env } from "../env.js";
import { signToken } from "../lib/auth.js";
import {
  deliverSocialEmails,
  monthlyMilestones,
  unsubscribeToken,
} from "../lib/social-notifications.js";
import { testDatabase } from "../lib/test-db.js";
import type { AuthVariables } from "../middleware/auth.js";
import setups from "./setups.js";
import social from "./social.js";
let db: ReturnType<typeof testDatabase>;
const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
app.route("/setups", setups);
app.route("/social", social);
beforeEach(() => {
  db = testDatabase();
  db.db.prepare("UPDATE users SET public_profile=1,email=?").run("delivered@resend.dev");
  db.env.WEB_ORIGIN = "https://tokenrats.com";
});
afterEach(() => {
  db.db.close();
  vi.restoreAllMocks();
});
async function request(path: string, user = "alice", method = "GET", body?: unknown) {
  return app.request(
    `https://test${path}`,
    {
      method,
      headers: {
        ...(user
          ? {
              Authorization: `Bearer ${await signToken(user, db.env.SESSION_SIGNING_KEY, 3600000)}`,
            }
          : {}),
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    },
    db.env,
  );
}
const body = (text = "Run the tests.", publish = false) => ({
  name: "Everyday coding",
  bundle: {
    files: [{ name: "AGENTS.md", content: text }],
    tools: "Paseo",
    models: "Planner and reviewer",
    workflow: "Delegate review.",
    subscriptions: "My plan",
  },
  note: "Trying a new reviewer",
  verdict: "experiment",
  visibility: publish ? "public" : "private",
});
async function create(text = "Run the tests.", publish = false) {
  const r = await request("/setups", "alice", "POST", body(text, publish));
  expect(r.status).toBe(201);
  return (await r.json()) as { id: string; versionId: string };
}
it("keeps private versions out of public history, feed and direct reads; restores as a new version", async () => {
  const a = await create("PRIVATE DRAFT");
  expect((await request(`/setups/${a.id}`, "")).status).toBe(404);
  expect((await request(`/setups/versions/${a.versionId}`, "bob")).status).toBe(404);
  const b = await request(`/setups/${a.id}/versions`, "alice", "POST", {
    ...body("PUBLIC EXCERPT", true),
    baseVersionId: a.versionId,
  });
  expect(b.status).toBe(201);
  const second = (await b.json()) as { versionId: string };
  const publicData = await (await request(`/setups/${a.id}`, "")).json();
  expect(JSON.stringify(publicData)).not.toContain("PRIVATE DRAFT");
  expect(publicData).toMatchObject({ history: [{ number: 2 }] });
  const stale = await request(`/setups/${a.id}/versions`, "alice", "POST", {
    ...body("stale"),
    baseVersionId: a.versionId,
  });
  expect(stale.status).toBe(409);
  expect(
    (
      await request(`/setups/${a.id}/versions`, "alice", "POST", {
        ...body("PRIVATE DRAFT"),
        baseVersionId: second.versionId,
      })
    ).status,
  ).toBe(201);
  const owner = (await (await request(`/setups/${a.id}`)).json()) as {
    history: { number: number }[];
  };
  expect(owner.history.map((v) => v.number)).toEqual([3, 2, 1]);
  const copied = await request(`/setups/versions/${second.versionId}/copy`, "bob", "POST");
  expect(copied.status).toBe(201);
  const c = (await copied.json()) as { id: string };
  expect((await request(`/setups/${c.id}`, "")).status).toBe(404);
  await request(`/setups/versions/${second.versionId}/visibility`, "alice", "PUT", {
    visibility: "private",
  });
  expect((await request(`/setups/${a.id}`, "")).status).toBe(404);
});
it("follows public accounts, emits one notification, and maintains version-specific shelves and ratings", async () => {
  await request("/setups/follow/alice", "bob", "PUT");
  const a = await create("Shared", true);
  const feed = await (await request("/setups/feed", "bob")).json();
  expect(feed).toMatchObject({ versions: [{ id: a.versionId }] });
  await request(`/setups/versions/${a.versionId}/visibility`, "alice", "PUT", {
    visibility: "public",
  });
  expect(await (await request("/social/notifications", "bob")).json()).toMatchObject({ unread: 1 });
  expect(
    (
      await request(`/setups/versions/${a.versionId}/review`, "bob", "PUT", {
        status: "want_to_try",
        stars: 5,
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await request(`/setups/versions/${a.versionId}/review`, "bob", "PUT", {
        status: "dropped",
        stars: 2,
        note: "Too much delegation for my small tasks.",
      })
    ).status,
  ).toBe(200);
  const detail = await (await request(`/setups/${a.id}`, "")).json();
  expect(detail).toMatchObject({
    version: { averageRating: 2, ratingCount: 1 },
    reviews: [{ status: "dropped", stars: 2 }],
  });
  expect(
    (
      await request(`/setups/versions/${a.versionId}/review`, "alice", "PUT", {
        status: "tried",
        stars: 5,
      })
    ).status,
  ).toBe(400);
  db.db.prepare("UPDATE users SET public_profile=0 WHERE id=?").run("alice");
  expect(await (await request("/setups/feed", "bob")).json()).toMatchObject({ versions: [] });
  expect(await (await request("/social/notifications", "bob")).json()).toMatchObject({ unread: 0 });
});
it("publishes only first monthly milestones, once, and suppresses old imports", async () => {
  await request("/setups/follow/alice", "bob", "PUT");
  const now = Date.UTC(2026, 8, 28);
  db.db
    .prepare(
      "INSERT INTO daily_rollup(user_id,day,tokens,cost_usd_cents,sessions) VALUES(?,?,?,?,?)",
    )
    .run("alice", "2026-09-28", 1_500_000, 0, 1);
  await monthlyMilestones(db.env, "alice", now);
  await monthlyMilestones(db.env, "alice", now);
  expect(db.db.prepare("SELECT COUNT(*) AS n FROM social_notifications").get()).toEqual({ n: 1 });
  db.db
    .prepare(
      "INSERT INTO daily_rollup(user_id,day,tokens,cost_usd_cents,sessions) VALUES(?,?,?,?,?)",
    )
    .run("alice", "2026-10-01", 1_500_000, 0, 1);
  await monthlyMilestones(db.env, "alice", Date.UTC(2026, 9, 1));
  expect(db.db.prepare("SELECT COUNT(*) AS n FROM social_notifications").get()).toEqual({ n: 1 });
  db.db.prepare("UPDATE daily_rollup SET tokens=100000000 WHERE day=?").run("2026-08-01");
  db.db
    .prepare(
      "INSERT INTO daily_rollup(user_id,day,tokens,cost_usd_cents,sessions) VALUES(?,?,?,?,?)",
    )
    .run("alice", "2026-08-01", 100_000_000, 0, 1);
  await monthlyMilestones(db.env, "alice", now);
  expect(db.db.prepare("SELECT COUNT(*) AS n FROM monthly_milestones").get()).toEqual({ n: 3 });
  expect(db.db.prepare("SELECT COUNT(*) AS n FROM social_notifications").get()).toEqual({ n: 1 });
});
it("delivers opted-in emails with idempotency, retries failures and supports signed unsubscribe", async () => {
  db.env.RESEND_API_KEY = "test";
  db.env.EMAIL_FROM = "updates@tokenrats.com";
  await request("/social/preferences", "bob", "PUT", {
    setupEmails: true,
    milestoneEmails: true,
    inApp: true,
    shareMilestones: true,
  });
  await request("/setups/follow/alice", "bob", "PUT");
  await create("Share", true);
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response("{}", { status: 503 }))
    .mockResolvedValue(new Response('{"id":"test"}', { status: 200 }));
  await deliverSocialEmails(db.env);
  expect(db.db.prepare("SELECT email_state FROM social_notifications").get()).toEqual({
    email_state: "pending",
  });
  await deliverSocialEmails(db.env, Date.now() + 400_000);
  expect(db.db.prepare("SELECT email_state FROM social_notifications").get()).toEqual({
    email_state: "sent",
  });
  expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get("Idempotency-Key")).toBe(
    new Headers(fetch.mock.calls[1]?.[1]?.headers).get("Idempotency-Key"),
  );
  await deliverSocialEmails(db.env, Date.now() + 800_000);
  expect(fetch).toHaveBeenCalledTimes(2);
  const token = await unsubscribeToken(db.env, "bob");
  expect(
    (await request(`/social/unsubscribe?token=${encodeURIComponent(token)}`, "", "POST")).status,
  ).toBe(200);
  expect(await (await request("/social/preferences", "bob")).json()).toMatchObject({
    prefs: { setupEmails: false, milestoneEmails: false },
  });
  expect((await request("/social/unsubscribe?token=bad", "", "POST")).status).toBe(400);
});
it("hides unpublished notifications and never sends an opted-out or unfollowed email", async () => {
  db.env.RESEND_API_KEY = "test";
  db.env.EMAIL_FROM = "updates@tokenrats.com";
  await request("/social/preferences", "bob", "PUT", {
    setupEmails: true,
    milestoneEmails: true,
    inApp: true,
    shareMilestones: true,
  });
  await request("/setups/follow/alice", "bob", "PUT");
  const a = await create("Shared", true);
  await request(`/setups/versions/${a.versionId}/visibility`, "alice", "PUT", {
    visibility: "private",
  });
  const fetch = vi.spyOn(globalThis, "fetch");
  await deliverSocialEmails(db.env);
  expect(fetch).not.toHaveBeenCalled();
  expect(await (await request("/social/notifications", "bob")).json()).toMatchObject({ unread: 0 });
});
