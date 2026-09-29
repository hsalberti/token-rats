import { CURRENT_RELEASE } from "@token-rats/contracts";
import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../env.js";
import { isAdmin } from "../lib/admin.js";
import {
  CAMPAIGN_ID,
  campaignReports,
  deliverReleaseEmails,
  prepareCampaign,
  recordCampaignActivity,
  releaseEmail,
} from "../lib/release-campaigns.js";
import { type AuthVariables, requireAuth } from "../middleware/auth.js";

const releases = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
releases.use("*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  c.header("Referrer-Policy", "no-referrer");
  await next();
});

releases.post("/visit", requireAuth, async (c) => {
  await recordCampaignActivity(c.env, c.var.userId, "returned");
  const claim = await c.env.DB.prepare(
    "INSERT OR IGNORE INTO release_views(user_id,release_id,seen_at) VALUES(?,?,?)",
  )
    .bind(c.var.userId, CURRENT_RELEASE.id, Date.now())
    .run();
  return c.json({ release: CURRENT_RELEASE, show: !!claim.meta.changes });
});
releases.post("/dismiss", requireAuth, async (c) => {
  await c.env.DB.prepare(
    "UPDATE release_views SET dismissed_at=COALESCE(dismissed_at,?) WHERE user_id=? AND release_id=?",
  )
    .bind(Date.now(), c.var.userId, CURRENT_RELEASE.id)
    .run();
  return c.json({ ok: true });
});
releases.get("/preferences", requireAuth, async (c) => {
  const row = await c.env.DB.prepare(
    "SELECT enabled FROM release_email_preferences WHERE user_id=?",
  )
    .bind(c.var.userId)
    .first<{ enabled: number }>();
  return c.json({ productEmails: row ? !!row.enabled : true });
});
releases.put("/preferences", requireAuth, async (c) => {
  const { productEmails } = z.object({ productEmails: z.boolean() }).parse(await c.req.json());
  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO release_email_preferences(user_id,enabled) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET enabled=excluded.enabled",
    ).bind(c.var.userId, +productEmails),
    ...(productEmails
      ? [
          c.env.DB.prepare(
            "DELETE FROM email_suppressions WHERE reason='unsubscribe' AND email=(SELECT TRIM(email) FROM users WHERE id=?)",
          ).bind(c.var.userId),
        ]
      : []),
  ]);
  return c.json({ productEmails });
});

releases.get("/email/:id", async (c) => {
  const row = await c.env.DB.prepare(
    "SELECT id FROM campaign_recipients WHERE id=? AND (sent_at IS NOT NULL OR first_attempt_at IS NOT NULL)",
  )
    .bind(c.req.param("id"))
    .first();
  if (!row) return c.text("This update link is unavailable.", 404);
  await c.env.DB.prepare(
    "UPDATE campaign_recipients SET clicked_at=COALESCE(clicked_at,?) WHERE id=?",
  )
    .bind(Date.now(), c.req.param("id"))
    .run();
  // A campaign link cannot sign a user in. The normal GitHub login still applies.
  return c.redirect(
    `${c.env.WEB_ORIGIN}/app/setups?utm_source=release_email&utm_campaign=${CAMPAIGN_ID}`,
  );
});
releases.get("/open/:image", async (c) => {
  const id = c.req.param("image").replace(/\.gif$/, "");
  if (c.req.method === "GET") {
    await c.env.DB.prepare(`UPDATE campaign_recipients SET opened_at=COALESCE(opened_at,?)
      WHERE id=? AND first_attempt_at IS NOT NULL AND opened_at IS NULL`)
      .bind(Date.now(), id)
      .run();
  }
  // A one-pixel transparent GIF. Provider events share the same unique counter.
  const bytes = Uint8Array.from(
    atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"),
    (c) => c.charCodeAt(0),
  );
  return c.body(bytes, 200, {
    "Content-Type": "image/gif",
    "Cache-Control": "no-store, max-age=0",
  });
});
releases.get("/unsubscribe/:id", async (c) => {
  const row = await c.env.DB.prepare("SELECT 1 FROM campaign_recipients WHERE id=?")
    .bind(c.req.param("id"))
    .first();
  if (!row) return c.text("This unsubscribe link is unavailable.", 404);
  // GET never mutates preferences: mail scanners can follow links.
  return c.html(
    '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Token Rats email preferences</title><body style="font:18px system-ui;max-width:520px;margin:60px auto;padding:24px"><h1>Product update emails</h1><p>Unsubscribe from Token Rats release announcements. Your account and saved setups stay available.</p><form method="post"><button style="font:inherit;padding:12px">Unsubscribe from product updates</button></form></body></html>',
  );
});
releases.post("/unsubscribe/:id", async (c) => {
  const row = await c.env.DB.prepare("SELECT user_id,email FROM campaign_recipients WHERE id=?")
    .bind(c.req.param("id"))
    .first<{ user_id: string; email: string }>();
  if (!row) return c.text("This unsubscribe link is unavailable.", 404);
  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO release_email_preferences(user_id,enabled) VALUES(?,0) ON CONFLICT(user_id) DO UPDATE SET enabled=0",
    ).bind(row.user_id),
    c.env.DB.prepare(
      "INSERT OR IGNORE INTO email_suppressions(email,reason,created_at) VALUES(?,'unsubscribe',?)",
    ).bind(row.email, Date.now()),
    c.env.DB.prepare(
      "UPDATE campaign_recipients SET unsubscribed_at=COALESCE(unsubscribed_at,?),status=CASE WHEN status='pending' THEN 'cancelled' ELSE status END WHERE email=?",
    ).bind(Date.now(), row.email),
  ]);
  return c.html(
    '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribed · Token Rats</title><body style="font:18px system-ui;max-width:520px;margin:60px auto;padding:24px"><h1>You’re unsubscribed</h1><p>You won’t receive more product update emails. You can change this in Notifications.</p><a href="https://tokenrats.com/app/notifications">Back to Token Rats</a></body></html>',
  );
});

releases.use("/campaigns/*", requireAuth, async (c, next) => {
  if (!(await isAdmin(c.env, c.var.userId))) return c.json({ error: "Admin access required" }, 403);
  return next();
});
releases.get("/campaigns/report", async (c) => {
  const views = await c.env.DB.prepare(
    "SELECT COUNT(*) AS seen,COUNT(dismissed_at) AS dismissed FROM release_views WHERE release_id=?",
  )
    .bind(CURRENT_RELEASE.id)
    .first();
  return c.json({
    campaigns: await campaignReports(c.env),
    walkthrough: views,
    delivery: await c.env.CACHE.get("release-email-readiness"),
    generatedAt: Date.now(),
  });
});
releases.post("/campaigns/prepare", async (c) => {
  await prepareCampaign(c.env);
  return c.json({
    campaigns: await campaignReports(c.env),
    preview: releaseEmail(c.env.WEB_ORIGIN, new URL(c.req.url).origin, "preview"),
  });
});
releases.post("/campaigns/start", async (c) => {
  if (!c.env.RESEND_API_KEY || !c.env.EMAIL_FROM || !c.env.RESEND_WEBHOOK_SECRET)
    return c.json(
      { error: "Email delivery and signed event tracking must be configured first" },
      503,
    );
  const result = await c.env.DB.prepare(
    "UPDATE release_campaigns SET status='sending',started_at=COALESCE(started_at,?) WHERE id=? AND status IN ('draft','paused')",
  )
    .bind(Date.now(), CAMPAIGN_ID)
    .run();
  return c.json({ started: !!result.meta.changes });
});
releases.post("/campaigns/pause", async (c) => {
  await c.env.DB.prepare(
    "UPDATE release_campaigns SET status='paused' WHERE id=? AND status='sending'",
  )
    .bind(CAMPAIGN_ID)
    .run();
  return c.json({ ok: true });
});
releases.post("/campaigns/deliver", async (c) =>
  c.json(await deliverReleaseEmails(c.env, new URL(c.req.url).origin)),
);

export default releases;
