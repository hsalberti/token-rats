import { Hono } from "hono";
import { Webhook } from "svix";
import { z } from "zod";
import type { Env } from "../env.js";

const eventSchema = z.object({
  type: z.string(),
  created_at: z.string(),
  data: z.object({
    email_id: z.string(),
    to: z.array(z.string()).optional(),
    tags: z
      .union([z.record(z.string()), z.array(z.object({ name: z.string(), value: z.string() }))])
      .optional(),
  }),
});
const webhook = new Hono<{ Bindings: Env }>();
webhook.post("/", async (c) => {
  if (!c.env.RESEND_WEBHOOK_SECRET) return c.json({ error: "Not configured" }, 503);
  let raw: unknown;
  try {
    const payload = await c.req.text();
    new Webhook(c.env.RESEND_WEBHOOK_SECRET).verify(payload, {
      "svix-id": c.req.header("svix-id") ?? "",
      "svix-timestamp": c.req.header("svix-timestamp") ?? "",
      "svix-signature": c.req.header("svix-signature") ?? "",
    });
    raw = JSON.parse(payload);
  } catch {
    return c.json({ error: "Invalid signature" }, 400);
  }
  const parsed = eventSchema.safeParse(raw);
  if (!parsed.success) return c.json({ error: "Invalid event" }, 400);
  const event = parsed.data;
  const at = Date.parse(event.created_at);
  if (!Number.isFinite(at)) return c.json({ error: "Invalid time" }, 400);
  const tags = Array.isArray(event.data.tags)
    ? Object.fromEntries(event.data.tags.map((t) => [t.name, t.value]))
    : event.data.tags;
  const row = await c.env.DB.prepare(`SELECT id,email FROM campaign_recipients WHERE provider_id=?
    OR (id=? AND campaign_id=?) LIMIT 1`)
    .bind(event.data.email_id, tags?.recipient ?? "", tags?.campaign ?? "")
    .first<{ id: string; email: string }>();
  const columns: Record<string, string> = {
    "email.sent": "sent_at",
    "email.delivered": "delivered_at",
    "email.opened": "opened_at",
    "email.bounced": "bounced_at",
    "email.complained": "complained_at",
  };
  const column = columns[event.type];
  if (row && column) {
    // Monotonic first timestamps make duplicates and out-of-order delivery harmless.
    await c.env.DB.prepare(`UPDATE campaign_recipients SET ${column}=MIN(COALESCE(${column},?),?),
      provider_id=COALESCE(provider_id,?),sent_at=MIN(COALESCE(sent_at,?),?),status=CASE WHEN status='pending' THEN 'sent' ELSE status END WHERE id=?`)
      .bind(at, at, event.data.email_id, at, at, row.id)
      .run();
  }
  if (row && ["email.failed", "email.suppressed"].includes(event.type)) {
    await c.env.DB.prepare("UPDATE campaign_recipients SET status='failed',error=? WHERE id=?")
      .bind(event.type, row.id)
      .run();
  }
  if (["email.bounced", "email.complained", "email.suppressed"].includes(event.type)) {
    const emails = row ? [row.email] : (event.data.to ?? []);
    for (const email of emails) {
      await c.env.DB.prepare(`INSERT INTO email_suppressions(email,reason,created_at) VALUES(?,?,?)
        ON CONFLICT(email) DO UPDATE SET reason=excluded.reason`)
        .bind(email.trim().toLowerCase(), event.type, at)
        .run();
    }
  }
  return c.json({ ok: true });
});
export default webhook;
