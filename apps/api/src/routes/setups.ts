import { SaveSetupVersion, SetupReview, SetupVisibility, setupChange } from "@token-rats/contracts";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { Env } from "../env.js";
import { connectedSql, friendsSql, readableSql } from "../lib/friendship.js";
import {
  VERSION_SELECT,
  type VersionRow,
  accessibleVersion,
  notificationInsert,
  serializeVersion,
} from "../lib/setups.js";
import { type AuthVariables, optionalAuth, requireAuth } from "../middleware/auth.js";
import watchers from "./setup-watchers.js";

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
setups.route("/watchers", watchers);

setups.get("/feed", optionalAuth, async (c) => {
  const user = c.var.userId ?? "";
  const mode = c.req.query("mode") ?? "following";
  if (!["following", "discover"].includes(mode)) return c.json({ error: "Invalid feed" }, 400);
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
      ? `AND ${connectedSql("(SELECT id FROM viewer)", "s.user_id")}`
      : "AND v.visibility='public' AND u.public_profile=1";
  const data =
    await c.env.DB.prepare(`${VERSION_SELECT} WHERE v.published_at IS NOT NULL AND ${readableSql()} ${filter}
 AND (v.published_at < ? OR (v.published_at = ? AND v.id < ?)) ORDER BY v.published_at DESC,v.id DESC LIMIT 21`)
      .bind(user, time, time, id)
      .all<VersionRow>();
  const rows = data.results.slice(0, 20);
  const last = rows.at(-1);
  return c.json({
    versions: await Promise.all(
      rows.map(async (row) => {
        const previous = await c.env.DB.prepare(
          `${VERSION_SELECT} WHERE s.id=? AND v.number<? AND ${readableSql()} ORDER BY v.number DESC LIMIT 1`,
        )
          .bind(user, row.setup_id, row.number)
          .first<VersionRow>();
        const version = serializeVersion(row);
        return {
          ...version,
          change: setupChange(
            version.bundle,
            previous ? JSON.parse(previous.bundle) : undefined,
            previous?.number ?? null,
          ),
        };
      }),
    ),
    nextCursor:
      data.results.length > 20 && last ? btoa(JSON.stringify([last.published_at, last.id])) : null,
  });
});
setups.get("/mine", requireAuth, async (c) => {
  const rows = await c.env.DB.prepare(
    `${VERSION_SELECT} WHERE s.user_id=? AND v.number=(SELECT MAX(number) FROM setup_versions WHERE setup_id=s.id) ORDER BY v.created_at DESC`,
  )
    .bind(c.var.userId, c.var.userId)
    .all<VersionRow>();
  return c.json({ versions: rows.results.map(serializeVersion) });
});
setups.get("/library", requireAuth, async (c) => {
  const rows = await c.env.DB.prepare(
    `${VERSION_SELECT} JOIN setup_reviews r ON r.version_id=v.id AND r.user_id=? WHERE v.published_at IS NOT NULL AND ${readableSql()} ORDER BY r.updated_at DESC LIMIT 100`,
  )
    .bind(c.var.userId, c.var.userId)
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
    await c.env.DB.prepare(`WITH viewer AS (SELECT ? AS id) SELECT u.id,u.handle,u.avatar_url AS avatarUrl,EXISTS(SELECT 1 FROM follows WHERE follower_id=(SELECT id FROM viewer) AND followed_id=u.id) AS following,
 EXISTS(SELECT 1 FROM follows WHERE follower_id=u.id AND followed_id=(SELECT id FROM viewer)) AS followsYou,
 ${friendsSql("(SELECT id FROM viewer)", "u.id")} AS friend
 FROM users u WHERE (u.public_profile=1 OR ${friendsSql("(SELECT id FROM viewer)", "u.id")} OR EXISTS(SELECT 1 FROM follows WHERE follower_id=u.id AND followed_id=(SELECT id FROM viewer))) AND u.id!=(SELECT id FROM viewer) AND u.handle LIKE ? ${c.req.query("friends") === "1" ? `AND ${friendsSql("(SELECT id FROM viewer)", "u.id")}` : ""} ORDER BY friend DESC,following DESC,u.handle LIMIT 50`)
      .bind(c.var.userId, `%${q}%`)
      .all();
  return c.json({ people: rows.results });
});
setups.get("/profile/:handle", optionalAuth, async (c) => {
  const user = await c.env.DB.prepare(
    `WITH viewer AS (SELECT ? AS id) SELECT u.id,u.handle,u.avatar_url,u.public_profile,${friendsSql("(SELECT id FROM viewer)", "u.id")} AS friend FROM users u WHERE handle=?`,
  )
    .bind(c.var.userId ?? "", c.req.param("handle"))
    .first<{
      id: string;
      handle: string;
      avatar_url: string | null;
      public_profile: number;
      friend: number;
    }>();
  if (!user || (!user.public_profile && !user.friend && user.id !== c.var.userId))
    return c.json({ error: "Not found" }, 404);
  const rows = await c.env.DB.prepare(
    `${VERSION_SELECT} WHERE s.user_id=? AND v.published_at IS NOT NULL AND ${readableSql()} AND v.number=(SELECT MAX(p.number) FROM setup_versions p WHERE p.setup_id=s.id AND p.published_at IS NOT NULL AND ${readableSql("p")}) ORDER BY s.featured DESC,v.published_at DESC`,
  )
    .bind(c.var.userId ?? "", user.id)
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
    friend: !!user.friend,
    owner: {
      handle: user.handle,
      avatarUrl: user.avatar_url,
      publicProfile: !!user.public_profile,
    },
  });
});
setups.put("/follow/:handle", requireAuth, async (c) => {
  const target = await c.env.DB.prepare("SELECT id FROM users WHERE handle=?")
    .bind(c.req.param("handle"))
    .first<{ id: string }>();
  if (!target || target.id === c.var.userId)
    return c.json({ error: "Choose another profile" }, 400);
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
  if (body.visibility === "public" && !owner?.public_profile)
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
      "INSERT INTO setup_versions(id,setup_id,number,name,bundle,note,verdict,created_at,published_at,visibility) VALUES(?,?,1,?,?,?,?,?,?,?)",
    ).bind(
      versionId,
      id,
      body.name,
      JSON.stringify(body.bundle),
      body.note,
      body.verdict,
      now,
      body.visibility !== "private" ? now : null,
      body.visibility,
    ),
  ];
  if (body.visibility !== "private")
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
  if (!v || !v.published_at) return c.json({ error: "Not found" }, 404);
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
setups.put("/versions/:id/visibility", requireAuth, async (c) => {
  const v = await accessibleVersion(c.env, c.req.param("id"), c.var.userId);
  if (!v || v.user_id !== c.var.userId) return c.json({ error: "Not found" }, 404);
  const visibility = SetupVisibility.parse((await c.req.json()).visibility);
  if (visibility === "public" && (!v.public_profile || v.automatic))
    return c.json(
      {
        error: v.automatic
          ? "Automatic captures are friends only. Copy the text into a new setup to share publicly."
          : "Make your profile public before sharing publicly.",
      },
      400,
    );
  const now = Date.now();
  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE setup_versions SET visibility=?,published_at=CASE WHEN ?='private' THEN NULL ELSE COALESCE(published_at,?) END WHERE id=?",
    ).bind(visibility, visibility, now, v.id),
    ...(visibility === "private"
      ? [
          c.env.DB.prepare(
            "UPDATE social_notifications SET email_state='cancelled' WHERE version_id=?",
          ).bind(v.id),
        ]
      : [
          notificationInsert(c.env, {
            actorId: c.var.userId,
            key: `setup:${v.id}`,
            kind: "setup",
            versionId: v.id,
            title: `@${v.handle} shared ${v.name}`,
            href: `/setups/${v.setup_id}?v=${v.id}`,
            now,
          }),
        ]),
  ]);
  return c.json({ visibility });
});
setups.put("/versions/:id/kudos", requireAuth, async (c) => {
  const v = await accessibleVersion(c.env, c.req.param("id"), c.var.userId);
  if (!v || !v.published_at) return c.json({ error: "Not found" }, 404);
  if (v.user_id === c.var.userId)
    return c.json({ error: "Give kudos to someone else's change" }, 400);
  await c.env.DB.prepare(
    "INSERT OR IGNORE INTO setup_kudos(user_id,version_id,created_at) VALUES(?,?,?)",
  )
    .bind(c.var.userId, v.id, Date.now())
    .run();
  return c.json({ ok: true });
});
setups.delete("/versions/:id/kudos", requireAuth, async (c) => {
  await c.env.DB.prepare("DELETE FROM setup_kudos WHERE user_id=? AND version_id=?")
    .bind(c.var.userId, c.req.param("id"))
    .run();
  return c.json({ ok: true });
});
setups.post("/:id/versions", requireAuth, async (c) => {
  const s = await c.env.DB.prepare("SELECT id FROM setups WHERE id=? AND user_id=?")
    .bind(c.req.param("id"), c.var.userId)
    .first();
  if (!s) return c.json({ error: "Not found" }, 404);
  const watcher = await c.env.DB.prepare("SELECT 1 FROM setup_watchers WHERE setup_id=?")
    .bind(c.req.param("id"))
    .first();
  if (watcher)
    return c.json(
      {
        error:
          "Edit the tracked file on your computer. Copy this version to start a separate setup.",
      },
      400,
    );
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
  if (body.visibility === "public" && !owner?.public_profile)
    return c.json(
      { error: "Make your profile public in Profile settings before publishing." },
      400,
    );
  const id = crypto.randomUUID();
  const now = Date.now();
  const setupId = c.req.param("id");
  const statements = [
    c.env.DB.prepare(
      "INSERT INTO setup_versions(id,setup_id,number,name,bundle,note,verdict,created_at,published_at,base_version_id,visibility) SELECT ?,?,MAX(number)+1,?,?,?,?,?,?,?,? FROM setup_versions WHERE setup_id=?",
    ).bind(
      id,
      setupId,
      body.name,
      JSON.stringify(body.bundle),
      body.note,
      body.verdict,
      now,
      body.visibility !== "private" ? now : null,
      body.baseVersionId,
      body.visibility,
      setupId,
    ),
    c.env.DB.prepare("UPDATE setups SET name=? WHERE id=?").bind(body.name, setupId),
  ];
  if (body.visibility !== "private")
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
    `${VERSION_SELECT} WHERE s.id=? AND ${readableSql()} ORDER BY v.number DESC`,
  )
    .bind(c.var.userId ?? "", c.req.param("id"))
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
