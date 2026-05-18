/**
 * Room routes:
 *   POST /v1/rooms            – create a room
 *   POST /v1/rooms/:code/join – join a room
 *   GET  /v1/rooms/:code      – get room + members (members only)
 */
import { Hono } from "hono";
import { CreateRoomRequest } from "@token-rats/contracts";
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
  await c.env.DB.prepare(
    "INSERT OR IGNORE INTO room_members (room_id, user_id, joined_at) VALUES (?, ?, ?)",
  )
    .bind(room.id, userId, now)
    .run();

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

export default rooms;
