import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../env.js";
import { notificationInsert } from "../lib/setups.js";
import { type AuthVariables, requireAuth } from "../middleware/auth.js";

const watchers = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
watchers.use("*", requireAuth);
interface WatchRow {
  id: string;
  user_id: string;
  setup_id: string;
  device_id: string;
  label: string;
  enabled: number;
  content_hash: string;
  last_seen_at: number;
  last_change_at: number | null;
  error: string | null;
}
function serialize(w: WatchRow) {
  return {
    id: w.id,
    setupId: w.setup_id,
    label: w.label,
    enabled: !!w.enabled,
    lastSeenAt: w.last_seen_at,
    lastChangeAt: w.last_change_at,
    error: w.error,
  };
}
async function hash(text: string) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))),
    (x) => x.toString(16).padStart(2, "0"),
  ).join("");
}
function bundle(content: string, label: string) {
  return JSON.stringify({
    files: [{ name: "AGENTS.md", content }],
    workflow: `Global instructions for ${label}. Place this file in your agent's global instructions directory.`,
    tools: label,
    models: "",
    subscriptions: "",
  });
}
watchers.get("/", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT * FROM setup_watchers WHERE user_id=? ORDER BY created_at DESC",
  )
    .bind(c.var.userId)
    .all<WatchRow>();
  return c.json({ watchers: rows.results.map(serialize) });
});
watchers.post("/", async (c) => {
  const body = z
    .object({
      id: z.string().uuid(),
      deviceId: z.string().min(1).max(100),
      label: z.string().trim().min(1).max(60),
      content: z.string().max(20000),
    })
    .strict()
    .parse(await c.req.json());
  const device = await c.env.DB.prepare("SELECT user_id,revoked_at FROM devices WHERE device_id=?")
    .bind(body.deviceId)
    .first<{ user_id: string; revoked_at: number | null }>();
  if (device && (device.revoked_at !== null || device.user_id !== c.var.userId))
    return c.json({ error: "device_revoked" }, 401);
  const existing = await c.env.DB.prepare("SELECT * FROM setup_watchers WHERE id=?")
    .bind(body.id)
    .first<WatchRow>();
  if (existing)
    return existing.user_id === c.var.userId
      ? c.json({ watcher: serialize(existing) })
      : c.json({ error: "Not found" }, 404);
  const now = Date.now();
  const setupId = `watch-${body.id}`;
  const versionId = crypto.randomUUID();
  const name = `Global AGENTS.md · ${body.label}`;
  const user = await c.env.DB.prepare("SELECT handle FROM users WHERE id=?")
    .bind(c.var.userId)
    .first<{ handle: string }>();
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO setups(id,user_id,name,created_at) VALUES(?,?,?,?)").bind(
      setupId,
      c.var.userId,
      name,
      now,
    ),
    c.env.DB.prepare(
      "INSERT INTO setup_versions(id,setup_id,number,name,bundle,note,verdict,created_at,published_at,visibility,automatic) VALUES(?,?,1,?,?,'Started automatic history.','using',?,?,'friends',1)",
    ).bind(versionId, setupId, name, bundle(body.content, body.label), now, now),
    c.env.DB.prepare(
      "INSERT INTO setup_watchers(id,user_id,setup_id,device_id,label,content_hash,last_seen_at,last_change_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
    ).bind(
      body.id,
      c.var.userId,
      setupId,
      body.deviceId,
      body.label,
      await hash(body.content),
      now,
      now,
      now,
    ),
    notificationInsert(c.env, {
      actorId: c.var.userId,
      key: `setup:${versionId}`,
      kind: "setup",
      versionId,
      title: `@${user?.handle} started sharing global AGENTS.md changes with friends`,
      href: `/setups/${setupId}?v=${versionId}`,
      now,
    }),
  ]);
  const row = await c.env.DB.prepare("SELECT * FROM setup_watchers WHERE id=?")
    .bind(body.id)
    .first<WatchRow>();
  return c.json({ watcher: serialize(row!) }, 201);
});
watchers.put("/:id", async (c) => {
  const { enabled } = z.object({ enabled: z.boolean() }).parse(await c.req.json());
  const row = await c.env.DB.prepare("SELECT * FROM setup_watchers WHERE id=? AND user_id=?")
    .bind(c.req.param("id"), c.var.userId)
    .first<WatchRow>();
  if (!row) return c.json({ error: "Not found" }, 404);
  await c.env.DB.prepare("UPDATE setup_watchers SET enabled=?,error=NULL WHERE id=?")
    .bind(+enabled, row.id)
    .run();
  return c.json({ watcher: serialize({ ...row, enabled: +enabled, error: null }) });
});
watchers.post("/:id/sync", async (c) => {
  const body = z
    .object({
      content: z.string().max(20000).optional(),
      error: z
        .enum([
          "File missing",
          "Cannot read file",
          "File exceeds 20,000 characters",
          "Private section is not closed",
        ])
        .optional(),
    })
    .strict()
    .parse(await c.req.json());
  const w = await c.env.DB.prepare("SELECT * FROM setup_watchers WHERE id=? AND user_id=?")
    .bind(c.req.param("id"), c.var.userId)
    .first<WatchRow>();
  if (!w) return c.json({ error: "Capture removed. Run setup-track to reconnect this file." }, 404);
  const device = await c.env.DB.prepare("SELECT revoked_at FROM devices WHERE device_id=?")
    .bind(w.device_id)
    .first<{ revoked_at: number | null }>();
  if (device?.revoked_at != null) return c.json({ error: "device_revoked" }, 401);
  if (!w.enabled) return c.json({ changed: false, watcher: serialize(w) });
  const now = Date.now();
  if (body.error || body.content === undefined) {
    await c.env.DB.prepare("UPDATE setup_watchers SET last_seen_at=?,error=? WHERE id=?")
      .bind(now, body.error ?? null, w.id)
      .run();
    return c.json({ changed: false });
  }
  const digest = await hash(body.content);
  if (digest === w.content_hash) {
    await c.env.DB.prepare("UPDATE setup_watchers SET last_seen_at=?,error=NULL WHERE id=?")
      .bind(now, w.id)
      .run();
    return c.json({ changed: false });
  }
  const latest = await c.env.DB.prepare(
    "SELECT id,name FROM setup_versions WHERE setup_id=? ORDER BY number DESC LIMIT 1",
  )
    .bind(w.setup_id)
    .first<{ id: string; name: string }>();
  const actor = await c.env.DB.prepare("SELECT handle FROM users WHERE id=?")
    .bind(c.var.userId)
    .first<{ handle: string }>();
  const id = crypto.randomUUID();
  const results = await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO setup_versions(id,setup_id,number,name,bundle,note,verdict,created_at,published_at,base_version_id,visibility,automatic)
      SELECT ?,?,MAX(number)+1,?,?,'','using',?,?,?,'friends',1 FROM setup_versions WHERE setup_id=?
      HAVING EXISTS(SELECT 1 FROM setup_watchers WHERE id=? AND enabled=1 AND content_hash=?)`).bind(
      id,
      w.setup_id,
      latest!.name,
      bundle(body.content, w.label),
      now,
      now,
      latest!.id,
      w.setup_id,
      w.id,
      w.content_hash,
    ),
    c.env.DB.prepare(
      "UPDATE setup_watchers SET content_hash=?,last_seen_at=?,last_change_at=?,error=NULL WHERE id=? AND enabled=1 AND content_hash=? AND EXISTS(SELECT 1 FROM setup_versions WHERE id=?)",
    ).bind(digest, now, now, w.id, w.content_hash, id),
    notificationInsert(c.env, {
      actorId: c.var.userId,
      key: `setup:${id}`,
      kind: "setup",
      versionId: id,
      title: `@${actor?.handle} changed global AGENTS.md`,
      href: `/setups/${w.setup_id}?v=${id}`,
      now,
    }),
  ]);
  return c.json({
    changed: !!results[0]?.meta.changes,
    versionId: results[0]?.meta.changes ? id : null,
  });
});
export default watchers;
