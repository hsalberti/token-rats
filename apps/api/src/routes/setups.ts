import { SaveSetupVersion, SetupReview } from "@token-rats/contracts";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { Env } from "../env.js";
import {
  VERSION_SELECT,
  type VersionRow,
  accessibleVersion,
  notificationInsert,
  serializeVersion,
} from "../lib/setups.js";
import { type AuthVariables, optionalAuth, requireAuth } from "../middleware/auth.js";

const setups = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
setups.use("*", bodyLimit({ maxSize: 400_000 }));
setups.use("*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  await next();
});
setups.onError((err, c) => {
  if (err instanceof z.ZodError)
    return c.json({ error: err.issues[0]?.message ?? "Invalid input" }, 400);
  if (err.message.includes("UNIQUE constraint failed"))
    return c.json({ error: "A newer version was saved. Reload before saving." }, 409);
  console.error("[setups]", err);
  return c.json({ error: "Could not save the setup. Please retry." }, 500);
});

setups.get("/feed", optionalAuth, async (c) => {
  const user = c.var.userId ?? "";
  const mode = c.req.query("mode") ?? "following";
  if (mode === "following" && !user) return c.json({ error: "Sign in to view your feed" }, 401);
  const raw = c.req.query("cursor");
  let time = Number.MAX_SAFE_INTEGER;
  let id = "\uffff";
  if (raw) {
    try {
      [time, id] = z
        .tuple([z.number().int().nonnegative(), z.string().max(100)])
        .parse(JSON.parse(atob(raw)));
    } catch {
      return c.json({ error: "Invalid cursor" }, 400);
    }
  }
  const filter =
    mode === "following"
      ? "AND (s.user_id=? OR s.user_id IN (SELECT followed_id FROM follows WHERE follower_id=?))"
      : "";
  const data =
    await c.env.DB.prepare(`${VERSION_SELECT} WHERE v.published_at IS NOT NULL AND u.public_profile=1 ${filter}
 AND (v.published_at < ? OR (v.published_at = ? AND v.id < ?)) ORDER BY v.published_at DESC,v.id DESC LIMIT 21`)
      .bind(...(mode === "following" ? [user, user] : []), time, time, id)
      .all<VersionRow>();
  const rows = data.results.slice(0, 20);
  const last = rows.at(-1);
  return c.json({
    versions: rows.map(serializeVersion),
    nextCursor:
      data.results.length > 20 && last ? btoa(JSON.stringify([last.published_at, last.id])) : null,
  });
});
setups.get("/mine", requireAuth, async (c) => {
  const rows = await c.env.DB.prepare(
    `${VERSION_SELECT} WHERE s.user_id=? AND v.number=(SELECT MAX(number) FROM setup_versions WHERE setup_id=s.id) ORDER BY v.created_at DESC`,
  )
    .bind(c.var.userId)
    .all<VersionRow>();
  return c.json({ versions: rows.results.map(serializeVersion) });
});
setups.get("/library", requireAuth, async (c) => {
  const rows = await c.env.DB.prepare(
    `${VERSION_SELECT} JOIN setup_reviews r ON r.version_id=v.id AND r.user_id=? WHERE v.published_at IS NOT NULL AND u.public_profile=1 ORDER BY r.updated_at DESC LIMIT 100`,
  )
    .bind(c.var.userId)
    .all<VersionRow>();
  const reviews = await c.env.DB.prepare(
    "SELECT version_id,status,stars,note FROM setup_reviews WHERE user_id=?",
  )
    .bind(c.var.userId)
    .all<{ version_id: string; status: string; stars: number | null; note: string }>();
  return c.json({
    versions: rows.results.map((v) => ({
      ...serializeVersion(v),
      shelf: reviews.results.find((r) => r.version_id === v.id),
    })),
  });
});
setups.get("/people", requireAuth, async (c) => {
  const q = (c.req.query("q") ?? "").slice(0, 60);
  const rows =
    await c.env.DB.prepare(`SELECT u.id,u.handle,u.avatar_url AS avatarUrl,EXISTS(SELECT 1 FROM follows WHERE follower_id=? AND followed_id=u.id) AS following
 FROM users u WHERE u.public_profile=1 AND u.id!=? AND u.handle LIKE ? ORDER BY following DESC,u.handle LIMIT 50`)
      .bind(c.var.userId, c.var.userId, `%${q}%`)
      .all();
  return c.json({ people: rows.results });
});
setups.get("/profile/:handle", optionalAuth, async (c) => {
  const user = await c.env.DB.prepare("SELECT id,public_profile FROM users WHERE handle=?")
    .bind(c.req.param("handle"))
    .first<{ id: string; public_profile: number }>();
  if (!user || (!user.public_profile && user.id !== c.var.userId))
    return c.json({ error: "Not found" }, 404);
  const rows = await c.env.DB.prepare(
    `${VERSION_SELECT} WHERE s.user_id=? AND v.published_at IS NOT NULL AND v.number=(SELECT MAX(number) FROM setup_versions WHERE setup_id=s.id AND published_at IS NOT NULL) ORDER BY s.featured DESC,v.published_at DESC`,
  )
    .bind(user.id)
    .all<VersionRow>();
  const follow = await c.env.DB.prepare(
    "SELECT 1 FROM follows WHERE follower_id=? AND followed_id=?",
  )
    .bind(c.var.userId ?? "", user.id)
    .first();
  return c.json({
    versions: rows.results.map(serializeVersion),
    following: !!follow,
    isOwner: c.var.userId === user.id,
  });
});
setups.put("/follow/:handle", requireAuth, async (c) => {
  const target = await c.env.DB.prepare("SELECT id FROM users WHERE handle=? AND public_profile=1")
    .bind(c.req.param("handle"))
    .first<{ id: string }>();
  if (!target || target.id === c.var.userId)
    return c.json({ error: "Choose another public profile" }, 400);
  await c.env.DB.prepare(
    "INSERT OR IGNORE INTO follows(follower_id,followed_id,created_at) VALUES(?,?,?)",
  )
    .bind(c.var.userId, target.id, Date.now())
    .run();
  return c.json({ following: true });
});
setups.delete("/follow/:handle", requireAuth, async (c) => {
  await c.env.DB.prepare(
    "DELETE FROM follows WHERE follower_id=? AND followed_id=(SELECT id FROM users WHERE handle=?)",
  )
    .bind(c.var.userId, c.req.param("handle"))
    .run();
  return c.json({ following: false });
});
setups.post("/", requireAuth, async (c) => {
  const body = SaveSetupVersion.parse(await c.req.json());
  const user = c.var.userId;
  const now = Date.now();
  const id = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const owner = await c.env.DB.prepare("SELECT public_profile,handle FROM users WHERE id=?")
    .bind(user)
    .first<{ public_profile: number; handle: string }>();
  if (body.publish && !owner?.public_profile)
    return c.json(
      { error: "Make your profile public in Profile settings before publishing." },
      400,
    );
  const statements = [
    c.env.DB.prepare("INSERT INTO setups(id,user_id,name,created_at) VALUES(?,?,?,?)").bind(
      id,
      user,
      body.name,
      now,
    ),
    c.env.DB.prepare(
      "INSERT INTO setup_versions(id,setup_id,number,name,bundle,note,verdict,created_at,published_at) VALUES(?,?,1,?,?,?,?,?,?)",
    ).bind(
      versionId,
      id,
      body.name,
      JSON.stringify(body.bundle),
      body.note,
      body.verdict,
      now,
      body.publish ? now : null,
    ),
  ];
  if (body.publish)
    statements.push(
      notificationInsert(c.env, {
        actorId: user,
        key: `setup:${versionId}`,
        kind: "setup",
        versionId,
        title: `@${owner?.handle} shared ${body.name}`,
        href: `/setups/${id}?v=${versionId}`,
        now,
      }),
    );
  await c.env.DB.batch(statements);
  return c.json({ id, versionId }, 201);
});
setups.get("/versions/:id", optionalAuth, async (c) => {
  const v = await accessibleVersion(c.env, c.req.param("id"), c.var.userId);
  if (!v) return c.json({ error: "Not found" }, 404);
  return c.json({ version: serializeVersion(v) });
});
setups.put("/versions/:id/review", requireAuth, async (c) => {
  const v = await accessibleVersion(c.env, c.req.param("id"), c.var.userId);
  if (!v || !v.published_at || !v.public_profile) return c.json({ error: "Not found" }, 404);
  if (v.user_id === c.var.userId)
    return c.json({ error: "You can rate setups by other people" }, 400);
  const body = SetupReview.parse(await c.req.json());
  await c.env.DB.prepare(
    "INSERT INTO setup_reviews(user_id,version_id,status,stars,note,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,version_id) DO UPDATE SET status=excluded.status,stars=excluded.stars,note=excluded.note,updated_at=excluded.updated_at",
  )
    .bind(c.var.userId, v.id, body.status, body.stars, body.note, Date.now())
    .run();
  return c.json({ ok: true });
});
setups.delete("/versions/:id/review", requireAuth, async (c) => {
  await c.env.DB.prepare("DELETE FROM setup_reviews WHERE user_id=? AND version_id=?")
    .bind(c.var.userId, c.req.param("id"))
    .run();
  return c.json({ ok: true });
});
setups.post("/versions/:id/copy", requireAuth, async (c) => {
  const v = await accessibleVersion(c.env, c.req.param("id"), c.var.userId);
  if (!v) return c.json({ error: "Not found" }, 404);
  const id = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const now = Date.now();
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO setups(id,user_id,name,created_at) VALUES(?,?,?,?)").bind(
      id,
      c.var.userId,
      `${v.name}`.slice(0, 100),
      now,
    ),
    c.env.DB.prepare(
      "INSERT INTO setup_versions(id,setup_id,number,name,bundle,note,verdict,origin_version_id,created_at) VALUES(?,?,1,?,?,?,?,?,?)",
    ).bind(
      versionId,
      id,
      v.name,
      v.bundle,
      `Adapted from @${v.handle}, version ${v.number}`,
      "experiment",
      v.id,
      now,
    ),
  ]);
  return c.json({ id, versionId }, 201);
});
setups.post("/versions/:id/publish", requireAuth, async (c) => {
  const v = await accessibleVersion(c.env, c.req.param("id"), c.var.userId);
  if (!v || v.user_id !== c.var.userId) return c.json({ error: "Not found" }, 404);
  if (!v.public_profile)
    return c.json(
      { error: "Make your profile public in Profile settings before publishing." },
      400,
    );
  const now = Date.now();
  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE setup_versions SET published_at=COALESCE(published_at,?) WHERE id=?",
    ).bind(now, v.id),
    notificationInsert(c.env, {
      actorId: c.var.userId,
      key: `setup:${v.id}`,
      kind: "setup",
      versionId: v.id,
      title: `@${v.handle} shared ${v.name}`,
      href: `/setups/${v.setup_id}?v=${v.id}`,
      now,
    }),
  ]);
  return c.json({ ok: true });
});
setups.delete("/versions/:id/publish", requireAuth, async (c) => {
  const v = await accessibleVersion(c.env, c.req.param("id"), c.var.userId);
  if (!v || v.user_id !== c.var.userId) return c.json({ error: "Not found" }, 404);
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE setup_versions SET published_at=NULL WHERE id=?").bind(v.id),
    c.env.DB.prepare(
      "UPDATE social_notifications SET email_state='cancelled' WHERE version_id=?",
    ).bind(v.id),
  ]);
  return c.json({ ok: true });
});
setups.post("/:id/versions", requireAuth, async (c) => {
  const s = await c.env.DB.prepare("SELECT id FROM setups WHERE id=? AND user_id=?")
    .bind(c.req.param("id"), c.var.userId)
    .first();
  if (!s) return c.json({ error: "Not found" }, 404);
  const body = SaveSetupVersion.parse(await c.req.json());
  const latest = await c.env.DB.prepare(
    "SELECT id FROM setup_versions WHERE setup_id=? ORDER BY number DESC LIMIT 1",
  )
    .bind(c.req.param("id"))
    .first<{ id: string }>();
  if (body.baseVersionId !== latest?.id)
    return c.json({ error: "A newer version was saved. Reload before saving your changes." }, 409);
  const owner = await c.env.DB.prepare("SELECT public_profile,handle FROM users WHERE id=?")
    .bind(c.var.userId)
    .first<{ public_profile: number; handle: string }>();
  if (body.publish && !owner?.public_profile)
    return c.json(
      { error: "Make your profile public in Profile settings before publishing." },
      400,
    );
  const id = crypto.randomUUID();
  const now = Date.now();
  const setupId = c.req.param("id");
  const statements = [
    c.env.DB.prepare(
      "INSERT INTO setup_versions(id,setup_id,number,name,bundle,note,verdict,created_at,published_at,base_version_id) SELECT ?,?,MAX(number)+1,?,?,?,?,?,?,? FROM setup_versions WHERE setup_id=?",
    ).bind(
      id,
      setupId,
      body.name,
      JSON.stringify(body.bundle),
      body.note,
      body.verdict,
      now,
      body.publish ? now : null,
      body.baseVersionId,
      setupId,
    ),
    c.env.DB.prepare("UPDATE setups SET name=? WHERE id=?").bind(body.name, setupId),
  ];
  if (body.publish)
    statements.push(
      notificationInsert(c.env, {
        actorId: c.var.userId,
        key: `setup:${id}`,
        kind: "setup",
        versionId: id,
        title: `@${owner?.handle} shared ${body.name}`,
        href: `/setups/${setupId}?v=${id}`,
        now,
      }),
    );
  await c.env.DB.batch(statements);
  return c.json({ id: setupId, versionId: id }, 201);
});
setups.post("/:id/feature", requireAuth, async (c) => {
  const s = await c.env.DB.prepare("SELECT id FROM setups WHERE id=? AND user_id=?")
    .bind(c.req.param("id"), c.var.userId)
    .first();
  if (!s) return c.json({ error: "Not found" }, 404);
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE setups SET featured=0 WHERE user_id=?").bind(c.var.userId),
    c.env.DB.prepare("UPDATE setups SET featured=1 WHERE id=?").bind(c.req.param("id")),
  ]);
  return c.json({ ok: true });
});
setups.delete("/:id", requireAuth, async (c) => {
  await c.env.DB.prepare("DELETE FROM setups WHERE id=? AND user_id=?")
    .bind(c.req.param("id"), c.var.userId)
    .run();
  return c.json({ ok: true });
});
setups.get("/:id", optionalAuth, async (c) => {
  const rows = await c.env.DB.prepare(
    `${VERSION_SELECT} WHERE s.id=? AND (s.user_id=? OR (v.published_at IS NOT NULL AND u.public_profile=1)) ORDER BY v.number DESC`,
  )
    .bind(c.req.param("id"), c.var.userId ?? "")
    .all<VersionRow>();
  const v = c.req.query("v")
    ? rows.results.find((v) => v.id === c.req.query("v"))
    : rows.results[0];
  if (!v) return c.json({ error: "Not found" }, 404);
  const reviews = await c.env.DB.prepare(
    "SELECT r.user_id AS userId,u.handle,r.status,r.stars,r.note,r.updated_at AS updatedAt FROM setup_reviews r JOIN users u ON u.id=r.user_id WHERE r.version_id=? AND (u.public_profile=1 OR u.id=?) ORDER BY r.updated_at DESC LIMIT 100",
  )
    .bind(v.id, c.var.userId ?? "")
    .all();
  const mine = await c.env.DB.prepare(
    "SELECT status,stars,note FROM setup_reviews WHERE version_id=? AND user_id=?",
  )
    .bind(v.id, c.var.userId ?? "")
    .first();
  const following = await c.env.DB.prepare(
    "SELECT 1 FROM follows WHERE follower_id=? AND followed_id=?",
  )
    .bind(c.var.userId ?? "", v.user_id)
    .first();
  return c.json({
    version: serializeVersion(v),
    history: rows.results.map(serializeVersion),
    reviews: reviews.results,
    mine,
    following: !!following,
    isOwner: c.var.userId === v.user_id,
  });
});
export default setups;
