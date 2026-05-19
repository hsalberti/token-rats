/**
 * Room routes:
 *   POST  /v1/rooms                  – create a room
 *   POST  /v1/rooms/:code/join       – join a room
 *   GET   /v1/rooms/:code            – get room + members (members only)
 *   POST  /v1/rooms/:code/leave      – leave a room (owner can't leave)
 *   PATCH /v1/rooms/:code            – rename a room (owner only)
 *   DELETE /v1/rooms/:code           – delete a room (owner only)
 *   GET   /v1/rooms/:code/activity   – recent activity feed
 */
import { Hono } from "hono";
import { CreateRoomRequest, RenameRoomRequest, GetActivityQuery } from "@token-rats/contracts";
import type { Env } from "../env.js";
import type { AuthVariables } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";
import { validationError, notFound, forbidden } from "../lib/errors.js";

type HonoEnv = { Bindings: Env; Variables: AuthVariables };

const rooms = new Hono<HonoEnv>();

/** Generate a random 6-character room code (lowercase a-z). */
function randomRoomCode(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz";
  const buf = new Uint8Array(6);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => chars[b % chars.length])
    .join("");
}

/* -------------------------------------------------------------------------- */
/* POST /v1/rooms                                                              */
/* -------------------------------------------------------------------------- */

rooms.post("/", requireAuth, async (c) => {
  const userId = c.var.userId;

  let body: { name: string };
  try {
    const raw: unknown = await c.req.json();
    body = CreateRoomRequest.parse(raw);
  } catch (e) {
    return validationError(c, e instanceof Error ? e.message : e);
  }

  const id = crypto.randomUUID();
  const code = randomRoomCode();
  const now = Date.now();

  // Insert room and creator membership atomically
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO rooms (id, code, name, owner_id, org_id, created_at)
       VALUES (?, ?, ?, ?, NULL, ?)`,
    ).bind(id, code, body.name, userId, now),
    c.env.DB.prepare(
      `INSERT INTO room_members (room_id, user_id, joined_at)
       VALUES (?, ?, ?)`,
    ).bind(id, userId, now),
  ]);

  return c.json(
    {
      room: {
        id,
        code,
        name: body.name,
        ownerId: userId,
        orgId: null,
        createdAt: now,
      },
    },
    201,
  );
});

/* -------------------------------------------------------------------------- */
/* POST /v1/rooms/:code/join                                                   */
/* -------------------------------------------------------------------------- */

rooms.post("/:code/join", requireAuth, async (c) => {
  const userId = c.var.userId;
  const code = c.req.param("code");

  // Find the room
  const room = await c.env.DB.prepare(
    "SELECT id, code, name, owner_id, org_id, created_at FROM rooms WHERE code = ?",
  )
    .bind(code)
    .first<{
      id: string;
      code: string;
      name: string;
      owner_id: string;
      org_id: string | null;
      created_at: number;
    }>();

  if (!room) {
    return notFound(c, "Room not found");
  }

  const now = Date.now();

  // INSERT OR IGNORE to handle already-joined gracefully
  const insert = await c.env.DB.prepare(
    "INSERT OR IGNORE INTO room_members (room_id, user_id, joined_at) VALUES (?, ?, ?)",
  )
    .bind(room.id, userId, now)
    .run();

  // Bust the leaderboard cache so the new member appears immediately instead of
  // waiting up to 60s for the KV TTL.
  if (insert.meta.changes > 0) {
    await Promise.all(
      (["today", "7d", "30d", "all"] as const).map((r) =>
        c.env.CACHE.delete(`lb:${room.code}:${r}`),
      ),
    );
  }

  return c.json({
    room: {
      id: room.id,
      code: room.code,
      name: room.name,
      ownerId: room.owner_id,
      orgId: room.org_id,
      createdAt: room.created_at,
    },
  });
});

/* -------------------------------------------------------------------------- */
/* GET /v1/rooms/:code                                                         */
/* -------------------------------------------------------------------------- */

rooms.get("/:code", requireAuth, async (c) => {
  const userId = c.var.userId;
  const code = c.req.param("code");

  // Find room
  const room = await c.env.DB.prepare(
    "SELECT id, code, name, owner_id, org_id, created_at FROM rooms WHERE code = ?",
  )
    .bind(code)
    .first<{
      id: string;
      code: string;
      name: string;
      owner_id: string;
      org_id: string | null;
      created_at: number;
    }>();

  if (!room) {
    return notFound(c, "Room not found");
  }

  // Check membership
  const membership = await c.env.DB.prepare(
    "SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?",
  )
    .bind(room.id, userId)
    .first();

  if (!membership) {
    return forbidden(c, "You are not a member of this room");
  }

  // Fetch members with user info
  const membersResult = await c.env.DB.prepare(
    `SELECT rm.user_id, u.handle, u.avatar_url, rm.joined_at
     FROM room_members rm
     JOIN users u ON u.id = rm.user_id
     WHERE rm.room_id = ?
     ORDER BY rm.joined_at ASC`,
  )
    .bind(room.id)
    .all<{
      user_id: string;
      handle: string;
      avatar_url: string | null;
      joined_at: number;
    }>();

  const members = (membersResult.results ?? []).map((m) => ({
    userId: m.user_id,
    handle: m.handle,
    avatarUrl: m.avatar_url,
    joinedAt: m.joined_at,
  }));

  return c.json({
    room: {
      id: room.id,
      code: room.code,
      name: room.name,
      ownerId: room.owner_id,
      orgId: room.org_id,
      createdAt: room.created_at,
    },
    members,
  });
});

/* -------------------------------------------------------------------------- */
/* POST /v1/rooms/:code/leave                                                  */
/* -------------------------------------------------------------------------- */

rooms.post("/:code/leave", requireAuth, async (c) => {
  const userId = c.var.userId;
  const code = c.req.param("code");

  const room = await c.env.DB.prepare(
    "SELECT id, owner_id FROM rooms WHERE code = ?",
  )
    .bind(code)
    .first<{ id: string; owner_id: string }>();

  if (!room) {
    return notFound(c, "Room not found");
  }

  // Check membership
  const membership = await c.env.DB.prepare(
    "SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?",
  )
    .bind(room.id, userId)
    .first();

  if (!membership) {
    return forbidden(c, "You are not a member of this room");
  }

  // Owner cannot leave — must delete the room (out of scope v1)
  if (room.owner_id === userId) {
    return forbidden(c, "Room owners cannot leave. Delete the room instead.");
  }

  await c.env.DB.prepare(
    "DELETE FROM room_members WHERE room_id = ? AND user_id = ?",
  )
    .bind(room.id, userId)
    .run();

  return c.json({ ok: true });
});

/* -------------------------------------------------------------------------- */
/* PATCH /v1/rooms/:code   (owner only — rename)                               */
/* -------------------------------------------------------------------------- */

rooms.patch("/:code", requireAuth, async (c) => {
  const userId = c.var.userId;
  const code = c.req.param("code");

  let body: { name: string };
  try {
    const raw: unknown = await c.req.json();
    body = RenameRoomRequest.parse(raw);
  } catch (e) {
    return validationError(c, e instanceof Error ? e.message : e);
  }

  const room = await c.env.DB.prepare(
    "SELECT id, code, name, owner_id, org_id, created_at FROM rooms WHERE code = ?",
  )
    .bind(code)
    .first<{
      id: string;
      code: string;
      name: string;
      owner_id: string;
      org_id: string | null;
      created_at: number;
    }>();

  if (!room) {
    return notFound(c, "Room not found");
  }

  if (room.owner_id !== userId) {
    return forbidden(c, "Only the room owner can rename the room");
  }

  await c.env.DB.prepare("UPDATE rooms SET name = ? WHERE id = ?")
    .bind(body.name, room.id)
    .run();

  return c.json({
    room: {
      id: room.id,
      code: room.code,
      name: body.name,
      ownerId: room.owner_id,
      orgId: room.org_id,
      createdAt: room.created_at,
    },
  });
});

/* -------------------------------------------------------------------------- */
/* DELETE /v1/rooms/:code   (owner only)                                       */
/* -------------------------------------------------------------------------- */

rooms.delete("/:code", requireAuth, async (c) => {
  const userId = c.var.userId;
  const code = c.req.param("code");

  const room = await c.env.DB.prepare("SELECT id, code, owner_id FROM rooms WHERE code = ?")
    .bind(code)
    .first<{ id: string; code: string; owner_id: string }>();

  if (!room) {
    return notFound(c, "Room not found");
  }

  if (room.owner_id !== userId) {
    return forbidden(c, "Only the room owner can delete the room");
  }

  // No ON DELETE CASCADE in the schema, so clear child rows first.
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM challenges WHERE room_id = ?").bind(room.id),
    c.env.DB.prepare("DELETE FROM room_members WHERE room_id = ?").bind(room.id),
    c.env.DB.prepare("DELETE FROM rooms WHERE id = ?").bind(room.id),
  ]);

  // Bust any cached leaderboards for this room code.
  await Promise.all(
    (["today", "7d", "30d", "all"] as const).map((r) =>
      c.env.CACHE.delete(`lb:${room.code}:${r}`),
    ),
  );

  return c.json({ ok: true });
});

/* -------------------------------------------------------------------------- */
/* GET /v1/rooms/:code/activity?limit=20                                       */
/* -------------------------------------------------------------------------- */

rooms.get("/:code/activity", requireAuth, async (c) => {
  const userId = c.var.userId;
  const code = c.req.param("code");

  let query: { limit: number };
  try {
    const raw = Object.fromEntries(new URL(c.req.url).searchParams.entries());
    query = GetActivityQuery.parse(raw);
  } catch (e) {
    return validationError(c, e instanceof Error ? e.message : e);
  }

  const room = await c.env.DB.prepare("SELECT id FROM rooms WHERE code = ?")
    .bind(code)
    .first<{ id: string }>();

  if (!room) {
    return notFound(c, "Room not found");
  }

  // Check membership
  const membership = await c.env.DB.prepare(
    "SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?",
  )
    .bind(room.id, userId)
    .first();

  if (!membership) {
    return forbidden(c, "You are not a member of this room");
  }

  const result = await c.env.DB.prepare(
    `SELECT
       s.id          AS session_id,
       s.ended_at    AS at,
       s.user_id,
       u.handle,
       u.avatar_url,
       (s.in_tokens + s.out_tokens) AS tokens,
       s.cost_usd_cents,
       s.model
     FROM sessions s
     JOIN room_members rm ON rm.user_id = s.user_id AND rm.room_id = ?
     JOIN users u ON u.id = s.user_id
     ORDER BY s.ended_at DESC
     LIMIT ?`,
  )
    .bind(room.id, query.limit)
    .all<{
      session_id: string;
      at: number;
      user_id: string;
      handle: string;
      avatar_url: string | null;
      tokens: number;
      cost_usd_cents: number;
      model: string;
    }>();

  const activity = (result.results ?? []).map((r) => ({
    sessionId: r.session_id,
    at: r.at,
    userId: r.user_id,
    handle: r.handle,
    avatarUrl: r.avatar_url,
    tokens: r.tokens,
    costUsdCents: r.cost_usd_cents,
    model: r.model,
  }));

  return c.json({ activity });
});

export default rooms;
