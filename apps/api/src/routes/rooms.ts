import { CreateRoomRequest, GetActivityQuery, RenameRoomRequest } from "@token-rats/contracts";
/**
 * Room routes:
 *   POST  /v1/rooms                  – create a room (private by default; can be public)
 *   POST  /v1/rooms/:code/join       – join a room (country-gated for public rooms)
 *   GET   /v1/rooms/:code            – get room + members
 *                                    (members-only for private; open for public)
 *   POST  /v1/rooms/:code/leave      – leave a room (owner can't leave)
 *   PATCH /v1/rooms/:code            – rename a room (owner only)
 *   GET   /v1/rooms/:code/activity   – recent activity feed
 *   GET   /v1/groups                 – list public rooms in caller's country
 */
import { Hono } from "hono";
import type { Env } from "../env.js";
import { conflict, forbidden, notFound, validationError } from "../lib/errors.js";
import type { AuthVariables } from "../middleware/auth.js";
import { optionalAuth, requireAuth } from "../middleware/auth.js";

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

interface RoomRow {
  id: string;
  code: string;
  name: string;
  owner_id: string;
  org_id: string | null;
  created_at: number;
  is_public: number;
  country: string | null;
}

function roomPayload(r: RoomRow) {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    ownerId: r.owner_id,
    orgId: r.org_id,
    createdAt: r.created_at,
    isPublic: r.is_public === 1,
    country: r.country,
  };
}

const ROOM_SELECT = "id, code, name, owner_id, org_id, created_at, is_public, country";

/** Feature #6: hard cap on public rooms per owner per country. */
const PUBLIC_ROOMS_PER_USER_PER_COUNTRY = 3;

/** Normalize a `cf-ipcountry` header value. Returns null for empty / "XX" / "T1". */
function cfCountry(c: { req: { header: (k: string) => string | undefined } }): string | null {
  const raw = c.req.header("cf-ipcountry");
  if (!raw) return null;
  const trimmed = raw.trim().toUpperCase();
  if (trimmed.length !== 2) return null;
  // CF returns "XX" for unknown and "T1" for Tor exit nodes.
  if (trimmed === "XX" || trimmed === "T1") return null;
  return trimmed;
}

/* -------------------------------------------------------------------------- */
/* POST /v1/rooms                                                              */
/* -------------------------------------------------------------------------- */

rooms.post("/", requireAuth, async (c) => {
  const userId = c.var.userId;

  let body: { name: string; isPublic: boolean };
  try {
    const raw: unknown = await c.req.json();
    body = CreateRoomRequest.parse(raw);
  } catch (e) {
    return validationError(c, e instanceof Error ? e.message : e);
  }

  let country: string | null = null;
  if (body.isPublic) {
    country = cfCountry(c);
    if (!country) {
      return validationError(
        c,
        "Public rooms require a Cloudflare-resolvable country (cf-ipcountry).",
      );
    }
    // 3-per-user-per-country cap.
    const existing = await c.env.DB.prepare(
      "SELECT COUNT(*) AS n FROM rooms WHERE owner_id = ? AND is_public = 1 AND country = ?",
    )
      .bind(userId, country)
      .first<{ n: number }>();
    if ((existing?.n ?? 0) >= PUBLIC_ROOMS_PER_USER_PER_COUNTRY) {
      return conflict(
        c,
        `You can create at most ${PUBLIC_ROOMS_PER_USER_PER_COUNTRY} public rooms per country.`,
        { error: "public_room_cap", country },
      );
    }
  }

  const id = crypto.randomUUID();
  const code = randomRoomCode();
  const now = Date.now();

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO rooms (id, code, name, owner_id, org_id, created_at, is_public, country)
       VALUES (?, ?, ?, ?, NULL, ?, ?, ?)`,
    ).bind(id, code, body.name, userId, now, body.isPublic ? 1 : 0, country),
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
        isPublic: body.isPublic,
        country,
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

  const room = await c.env.DB.prepare(`SELECT ${ROOM_SELECT} FROM rooms WHERE code = ?`)
    .bind(code)
    .first<RoomRow>();

  if (!room) {
    return notFound(c, "Room not found");
  }

  // Public-room country gate. We only check at join time; once joined the
  // user is *not* re-checked when their cf-ipcountry changes (travel / VPN).
  if (room.is_public === 1) {
    const viewerCountry = cfCountry(c);
    if (!viewerCountry || viewerCountry !== room.country) {
      return c.json(
        {
          error: {
            code: "country_mismatch",
            message: "This public room is locked to a different country.",
            details: { expected: room.country, observed: viewerCountry },
          },
        },
        403,
      );
    }
  }

  const now = Date.now();

  // INSERT OR IGNORE to handle already-joined gracefully
  const insert = await c.env.DB.prepare(
    "INSERT OR IGNORE INTO room_members (room_id, user_id, joined_at) VALUES (?, ?, ?)",
  )
    .bind(room.id, userId, now)
    .run();

  if (insert.meta.changes > 0) {
    await Promise.all(
      (["today", "7d", "30d", "all"] as const).map((r) =>
        c.env.CACHE.delete(`lb:${room.code}:${r}`),
      ),
    );
  }

  return c.json({ room: roomPayload(room) });
});

/* -------------------------------------------------------------------------- */
/* GET /v1/rooms/:code                                                         */
/* -------------------------------------------------------------------------- */

rooms.get("/:code", optionalAuth, async (c) => {
  const userId = c.var.userId ?? null;
  const code = c.req.param("code");

  const room = await c.env.DB.prepare(`SELECT ${ROOM_SELECT} FROM rooms WHERE code = ?`)
    .bind(code)
    .first<RoomRow>();

  if (!room) {
    return notFound(c, "Room not found");
  }

  // Public rooms are open to everyone (signed-in or out). Private rooms
  // remain member-only.
  if (room.is_public !== 1) {
    if (!userId) return forbidden(c, "You are not a member of this room");

    const membership = await c.env.DB.prepare(
      "SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?",
    )
      .bind(room.id, userId)
      .first();

    if (!membership) {
      return forbidden(c, "You are not a member of this room");
    }
  }

  // Fetch members with user info + verified-X handle.
  const membersResult = await c.env.DB.prepare(
    `SELECT rm.user_id, u.handle, u.avatar_url, rm.joined_at,
            CASE WHEN u.twitter_verified_at IS NOT NULL THEN u.twitter_handle ELSE NULL END
              AS twitter_handle
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
      twitter_handle: string | null;
    }>();

  const members = (membersResult.results ?? []).map((m) => ({
    userId: m.user_id,
    handle: m.handle,
    avatarUrl: m.avatar_url,
    joinedAt: m.joined_at,
    twitterHandle: m.twitter_handle,
  }));

  return c.json({ room: roomPayload(room), members });
});

/* -------------------------------------------------------------------------- */
/* POST /v1/rooms/:code/leave                                                  */
/* -------------------------------------------------------------------------- */

rooms.post("/:code/leave", requireAuth, async (c) => {
  const userId = c.var.userId;
  const code = c.req.param("code");

  const room = await c.env.DB.prepare("SELECT id, owner_id FROM rooms WHERE code = ?")
    .bind(code)
    .first<{ id: string; owner_id: string }>();

  if (!room) {
    return notFound(c, "Room not found");
  }

  const membership = await c.env.DB.prepare(
    "SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?",
  )
    .bind(room.id, userId)
    .first();

  if (!membership) {
    return forbidden(c, "You are not a member of this room");
  }

  if (room.owner_id === userId) {
    return forbidden(c, "Room owners cannot leave. Delete the room instead.");
  }

  await c.env.DB.prepare("DELETE FROM room_members WHERE room_id = ? AND user_id = ?")
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

  const room = await c.env.DB.prepare(`SELECT ${ROOM_SELECT} FROM rooms WHERE code = ?`)
    .bind(code)
    .first<RoomRow>();

  if (!room) {
    return notFound(c, "Room not found");
  }

  if (room.owner_id !== userId) {
    return forbidden(c, "Only the room owner can rename the room");
  }

  await c.env.DB.prepare("UPDATE rooms SET name = ? WHERE id = ?").bind(body.name, room.id).run();

  return c.json({
    room: { ...roomPayload(room), name: body.name },
  });
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
