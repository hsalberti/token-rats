import { CreateRoomRequest, GetActivityQuery, RenameRoomRequest } from "@token-rats/contracts";
/**
 * Room routes:
 *   POST  /v1/rooms                  – create a room (optionally public+country-locked)
 *   POST  /v1/rooms/:code/join       – join a room (country-locked for public rooms)
 *   GET   /v1/rooms/:code            – get room + members (members only)
 *   POST  /v1/rooms/:code/leave      – leave a room (owner can't leave)
 *   PATCH /v1/rooms/:code            – rename / toggle is_public (owner only)
 *   GET   /v1/rooms/:code/activity   – recent activity feed
 *
 * v1.2 Track AE: public rooms are discoverable in `/v1/groups` only to
 * viewers whose Cloudflare-resolved `cf-ipcountry` equals `rooms.country`.
 * The same check gates joins. The `pg:{COUNTRY}` cache is busted on every
 * mutation that could change a country's listing (create / patch / join /
 * leave).
 */
import { Hono } from "hono";
import type { Env } from "../env.js";
import { getViewerCountry } from "../lib/country.js";
import { forbidden, notFound, validationError } from "../lib/errors.js";
import type { AuthVariables } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";
import { publicGroupsCacheKey } from "./groups.js";

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

/** Shape of a `rooms` row when we read it back for response/serialization. */
interface RoomRow {
  id: string;
  code: string;
  name: string;
  owner_id: string;
  org_id: string | null;
  created_at: number;
  is_public: number | null;
  country: string | null;
}

const ROOM_SELECT_COLS = "id, code, name, owner_id, org_id, created_at, is_public, country";

function roomRowToJson(row: RoomRow) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    ownerId: row.owner_id,
    orgId: row.org_id,
    createdAt: row.created_at,
    isPublic: row.is_public === 1,
    country: row.country ? row.country.toUpperCase() : null,
  };
}

/** Bust the public-groups KV cache for a country (if there is one). */
async function bustPublicGroupsCache(env: Env, country: string | null | undefined) {
  if (!country) return;
  await env.CACHE.delete(publicGroupsCacheKey(country));
}

/* -------------------------------------------------------------------------- */
/* POST /v1/rooms                                                              */
/* -------------------------------------------------------------------------- */

rooms.post("/", requireAuth, async (c) => {
  const userId = c.var.userId;

  let body: { name: string; isPublic?: boolean; country?: string };
  try {
    const raw: unknown = await c.req.json();
    body = CreateRoomRequest.parse(raw);
  } catch (e) {
    return validationError(c, e instanceof Error ? e.message : e);
  }

  // v1.2 Track AE — public rooms must be created from the country they lock to.
  let storedCountry: string | null = null;
  let isPublic = 0;
  if (body.isPublic) {
    if (!body.country) {
      return validationError(c, "`country` is required when `isPublic` is true");
    }
    const viewerCountry = getViewerCountry(c);
    if (!viewerCountry) {
      return validationError(
        c,
        "Could not resolve your country from `cf-ipcountry`. Public rooms require a valid country signal.",
      );
    }
    if (viewerCountry !== body.country.toUpperCase()) {
      return validationError(
        c,
        `\`country\` (${body.country}) must match your resolved cf-ipcountry (${viewerCountry}).`,
      );
    }
    storedCountry = viewerCountry;
    isPublic = 1;
  }

  const id = crypto.randomUUID();
  const code = randomRoomCode();
  const now = Date.now();

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO rooms (id, code, name, owner_id, org_id, created_at, is_public, country)
       VALUES (?, ?, ?, ?, NULL, ?, ?, ?)`,
    ).bind(id, code, body.name, userId, now, isPublic, storedCountry),
    c.env.DB.prepare(
      `INSERT INTO room_members (room_id, user_id, joined_at)
       VALUES (?, ?, ?)`,
    ).bind(id, userId, now),
  ]);

  // A new public room must appear in `/v1/groups` for its country immediately.
  if (isPublic === 1) {
    await bustPublicGroupsCache(c.env, storedCountry);
  }

  return c.json(
    {
      room: {
        id,
        code,
        name: body.name,
        ownerId: userId,
        orgId: null,
        createdAt: now,
        isPublic: isPublic === 1,
        country: storedCountry,
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

  const room = await c.env.DB.prepare(`SELECT ${ROOM_SELECT_COLS} FROM rooms WHERE code = ?`)
    .bind(code)
    .first<RoomRow>();

  if (!room) {
    return notFound(c, "Room not found");
  }

  // v1.2 Track AE — country lock on public rooms.
  if (room.is_public === 1 && room.country) {
    const viewerCountry = getViewerCountry(c);
    if (!viewerCountry || viewerCountry !== room.country.toUpperCase()) {
      return c.json(
        {
          error: "country_locked",
          room_country: room.country.toUpperCase(),
          your_country: viewerCountry,
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
    // Bust the leaderboard cache so the new member appears immediately instead
    // of waiting up to 60s for the KV TTL.
    await Promise.all(
      (["today", "7d", "30d", "all"] as const).map((r) =>
        c.env.CACHE.delete(`lb:${room.code}:${r}`),
      ),
    );
    // Public-groups listing shows memberCount — bust it so the new joiner is
    // reflected in the ordering on the next /v1/groups read.
    if (room.is_public === 1) {
      await bustPublicGroupsCache(c.env, room.country);
    }
  }

  return c.json({ room: roomRowToJson(room) });
});

/* -------------------------------------------------------------------------- */
/* GET /v1/rooms/:code                                                         */
/* -------------------------------------------------------------------------- */

rooms.get("/:code", requireAuth, async (c) => {
  const userId = c.var.userId;
  const code = c.req.param("code");

  const room = await c.env.DB.prepare(`SELECT ${ROOM_SELECT_COLS} FROM rooms WHERE code = ?`)
    .bind(code)
    .first<RoomRow>();

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
    room: roomRowToJson(room),
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
    "SELECT id, owner_id, is_public, country FROM rooms WHERE code = ?",
  )
    .bind(code)
    .first<{
      id: string;
      owner_id: string;
      is_public: number | null;
      country: string | null;
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

  // Owner cannot leave — must delete the room (out of scope v1)
  if (room.owner_id === userId) {
    return forbidden(c, "Room owners cannot leave. Delete the room instead.");
  }

  await c.env.DB.prepare("DELETE FROM room_members WHERE room_id = ? AND user_id = ?")
    .bind(room.id, userId)
    .run();

  if (room.is_public === 1) {
    await bustPublicGroupsCache(c.env, room.country);
  }

  return c.json({ ok: true });
});

/* -------------------------------------------------------------------------- */
/* PATCH /v1/rooms/:code   (owner only — rename + v1.2 AE toggle is_public)    */
/* -------------------------------------------------------------------------- */

rooms.patch("/:code", requireAuth, async (c) => {
  const userId = c.var.userId;
  const code = c.req.param("code");

  let body: { name?: string; isPublic?: boolean; country?: string };
  try {
    const raw: unknown = await c.req.json();
    body = RenameRoomRequest.parse(raw);
  } catch (e) {
    return validationError(c, e instanceof Error ? e.message : e);
  }

  const room = await c.env.DB.prepare(`SELECT ${ROOM_SELECT_COLS} FROM rooms WHERE code = ?`)
    .bind(code)
    .first<RoomRow>();

  if (!room) {
    return notFound(c, "Room not found");
  }

  if (room.owner_id !== userId) {
    return forbidden(c, "Only the room owner can update the room");
  }

  let nextIsPublic = room.is_public === 1;
  let nextCountry = room.country ? room.country.toUpperCase() : null;

  if (body.isPublic === true && room.is_public !== 1) {
    if (!body.country) {
      return validationError(c, "`country` is required when flipping `isPublic` to true");
    }
    const viewerCountry = getViewerCountry(c);
    if (!viewerCountry) {
      return validationError(c, "Could not resolve your country from `cf-ipcountry`.");
    }
    if (viewerCountry !== body.country.toUpperCase()) {
      return validationError(
        c,
        `\`country\` (${body.country}) must match your resolved cf-ipcountry (${viewerCountry}).`,
      );
    }
    nextIsPublic = true;
    nextCountry = viewerCountry;
  } else if (body.isPublic === false && room.is_public === 1) {
    nextIsPublic = false;
    nextCountry = room.country ? room.country.toUpperCase() : null;
  }

  const nextName = body.name ?? room.name;

  await c.env.DB.prepare("UPDATE rooms SET name = ?, is_public = ?, country = ? WHERE id = ?")
    .bind(nextName, nextIsPublic ? 1 : 0, nextCountry, room.id)
    .run();

  await Promise.all([
    bustPublicGroupsCache(c.env, room.country),
    bustPublicGroupsCache(c.env, nextCountry),
  ]);

  return c.json({
    room: {
      id: room.id,
      code: room.code,
      name: nextName,
      ownerId: room.owner_id,
      orgId: room.org_id,
      createdAt: room.created_at,
      isPublic: nextIsPublic,
      country: nextCountry,
    },
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
