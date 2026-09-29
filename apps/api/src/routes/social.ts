import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../env.js";
import { LIVE_NOTICE, unsubscribeUser } from "../lib/social-notifications.js";
import type { AuthVariables } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";
const social = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
social.use("*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  await next();
});
const prefsSchema = z.object({
  setupEmails: z.boolean(),
  milestoneEmails: z.boolean(),
  inApp: z.boolean(),
  shareMilestones: z.boolean(),
});
social.get("/preferences", requireAuth, async (c) => {
  const r = await c.env.DB.prepare("SELECT * FROM social_prefs WHERE user_id=?")
    .bind(c.var.userId)
    .first<{
      setup_emails: number;
      milestone_emails: number;
      in_app: number;
      share_milestones: number;
    }>();
  return c.json({
    prefs: {
      setupEmails: r?.setup_emails === 1,
      milestoneEmails: r?.milestone_emails === 1,
      inApp: r?.in_app !== 0,
      shareMilestones: r?.share_milestones !== 0,
    },
    emailConfigured: !!(c.env.RESEND_API_KEY && c.env.EMAIL_FROM),
  });
});
social.put("/preferences", requireAuth, async (c) => {
  const parsed = prefsSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Invalid preferences" }, 400);
  const p = parsed.data;
  await c.env.DB.prepare(
    "INSERT INTO social_prefs(user_id,setup_emails,milestone_emails,in_app,share_milestones) VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET setup_emails=excluded.setup_emails,milestone_emails=excluded.milestone_emails,in_app=excluded.in_app,share_milestones=excluded.share_milestones",
  )
    .bind(c.var.userId, +p.setupEmails, +p.milestoneEmails, +p.inApp, +p.shareMilestones)
    .run();
  return c.json({ prefs: p });
});
social.get("/notifications", requireAuth, async (c) => {
  const filter = `n.user_id=? AND COALESCE((SELECT in_app FROM social_prefs WHERE user_id=n.user_id),1)=1 AND ${LIVE_NOTICE}`;
  const rows = await c.env.DB.prepare(
    `SELECT n.id,n.title,n.href,n.kind,n.created_at AS createdAt,n.read_at AS readAt FROM social_notifications n JOIN users a ON a.id=n.actor_id WHERE ${filter} ORDER BY n.created_at DESC LIMIT 100`,
  )
    .bind(c.var.userId)
    .all();
  const count = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM social_notifications n JOIN users a ON a.id=n.actor_id WHERE ${filter} AND n.read_at IS NULL`,
  )
    .bind(c.var.userId)
    .first<{ n: number }>();
  return c.json({ notifications: rows.results, unread: count?.n ?? 0 });
});
social.post("/read", requireAuth, async (c) => {
  await c.env.DB.prepare(
    "UPDATE social_notifications SET read_at=? WHERE user_id=? AND read_at IS NULL",
  )
    .bind(Date.now(), c.var.userId)
    .run();
  return c.json({ ok: true });
});
social.get("/unsubscribe", async (c) => {
  const token = c.req.query("token") ?? "";
  if (!(await unsubscribeUser(c.env, token))) return c.text("Invalid link", 400);
  return c.html(
    `<html lang="en"><meta name="viewport" content="width=device-width"><title>Token Rats email preferences</title><body><h1>Unsubscribe from friend emails</h1><form method="post"><button>Turn off setup and milestone emails</button></form><p>In-app notifications will remain available.</p></body></html>`,
  );
});
social.post("/unsubscribe", async (c) => {
  const user = await unsubscribeUser(c.env, c.req.query("token") ?? "");
  if (!user) return c.text("Invalid link", 400);
  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE social_prefs SET setup_emails=0,milestone_emails=0 WHERE user_id=?",
    ).bind(user),
    c.env.DB.prepare(
      "UPDATE social_notifications SET email_state='cancelled' WHERE user_id=? AND email_state='pending'",
    ).bind(user),
  ]);
  return c.text("You have unsubscribed from setup and milestone emails.");
});
export default social;
