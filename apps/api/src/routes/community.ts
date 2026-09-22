import { CreatePostRequest, CreateReplyRequest, PostKind } from "@token-rats/contracts";
import { Hono } from "hono";
import type { Env } from "../env.js";
import { isAdmin } from "../lib/admin.js";
import { rateLimited, validationError } from "../lib/errors.js";
import { rateLimit } from "../lib/rate-limit.js";
import { type AuthVariables, requireAuth } from "../middleware/auth.js";

const community = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
const selectPost = `SELECT p.id, p.kind, p.title, p.body, p.created_at AS createdAt,
  u.handle, (SELECT COUNT(*) FROM community_replies r WHERE r.post_id = p.id) AS replies
  FROM community_posts p JOIN users u ON u.id = p.user_id`;
const offsetOf = (raw: string | undefined) =>
  Math.min(100000, Math.max(0, Number.parseInt(raw ?? "0", 10) || 0));

community.get("/", async (c) => {
  const raw = c.req.query("kind");
  const kind = raw ? PostKind.safeParse(raw) : null;
  if (kind && !kind.success) return validationError(c, "Invalid post kind");
  const offset = offsetOf(c.req.query("offset"));
  const result = await c.env.DB.prepare(`${selectPost} ${kind ? "WHERE p.kind = ?" : ""}
    ORDER BY p.created_at DESC, p.id DESC LIMIT 21 OFFSET ?`)
    .bind(...(kind?.success ? [kind.data, offset] : [offset]))
    .all();
  return c.json({
    posts: result.results.slice(0, 20),
    nextOffset: result.results.length > 20 ? offset + 20 : null,
  });
});
community.get("/:id", async (c) => {
  const post = await c.env.DB.prepare(`${selectPost} WHERE p.id = ?`)
    .bind(c.req.param("id"))
    .first();
  if (!post) return c.json({ error: "not_found" }, 404);
  const offset = offsetOf(c.req.query("offset"));
  const replies = await c.env.DB.prepare(`SELECT r.id, r.body, r.created_at AS createdAt, u.handle
    FROM community_replies r JOIN users u ON u.id = r.user_id WHERE r.post_id = ?
    ORDER BY r.created_at, r.id LIMIT 51 OFFSET ?`)
    .bind(c.req.param("id"), offset)
    .all();
  return c.json({
    post,
    replies: replies.results.slice(0, 50),
    nextOffset: replies.results.length > 50 ? offset + 50 : null,
  });
});
community.post("/", requireAuth, async (c) => {
  if (!(await rateLimit(c.env.CACHE, `community:${c.var.userId}`, 10)).allowed)
    return rateLimited(c);
  const parsed = CreatePostRequest.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error.message);
  const { kind, title, body } = parsed.data;
  const id = crypto.randomUUID();
  await c.env.DB.prepare(`INSERT INTO community_posts (id, user_id, kind, title, body, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(id, c.var.userId, kind, title, body, Date.now())
    .run();
  return c.json({ id }, 201);
});
community.post("/:id/replies", requireAuth, async (c) => {
  if (!(await rateLimit(c.env.CACHE, `community:${c.var.userId}`, 10)).allowed)
    return rateLimited(c);
  const parsed = CreateReplyRequest.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error.message);
  const post = await c.env.DB.prepare("SELECT id FROM community_posts WHERE id = ?")
    .bind(c.req.param("id"))
    .first();
  if (!post) return c.json({ error: "not_found" }, 404);
  const id = crypto.randomUUID();
  await c.env.DB.prepare(`INSERT INTO community_replies (id, post_id, user_id, body, created_at)
    VALUES (?, ?, ?, ?, ?)`)
    .bind(id, c.req.param("id"), c.var.userId, parsed.data.body, Date.now())
    .run();
  return c.json({ id }, 201);
});
for (const [route, table] of [
  ["/:id", "community_posts"],
  ["/replies/:id", "community_replies"],
] as const) {
  community.delete(route, requireAuth, async (c) => {
    const row = await c.env.DB.prepare(`SELECT user_id FROM ${table} WHERE id = ?`)
      .bind(c.req.param("id"))
      .first<{ user_id: string }>();
    if (!row) return c.json({ error: "not_found" }, 404);
    if (row.user_id !== c.var.userId && !(await isAdmin(c.env, c.var.userId)))
      return c.json({ error: "forbidden" }, 403);
    const statements = [];
    if (table === "community_posts")
      statements.push(
        c.env.DB.prepare("DELETE FROM community_replies WHERE post_id = ?").bind(c.req.param("id")),
      );
    statements.push(c.env.DB.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(c.req.param("id")));
    await c.env.DB.batch(statements);
    return c.json({ deleted: true });
  });
}
export default community;
