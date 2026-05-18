/**
 * GET   /v1/me          — returns the authenticated user's profile.
 * PATCH /v1/me          — update publicProfile, bio, twitterHandle.
 * GET   /v1/me/rooms    — returns all rooms the authenticated user is a member of.
 */
import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../env.js";
import type { AuthVariables } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";
import { notFound, validationError } from "../lib/errors.js";

type HonoEnv = { Bindings: Env; Variables: AuthVariables };

const me = new Hono<HonoEnv>();

me.get("/", requireAuth, async (c) => {
  const userId = c.var.userId;

  const row = await c.env.DB.prepare("SELECT id, handle, avatar_url FROM users WHERE id = ?")
    .bind(userId)
    .first<{ id: string; handle: string; avatar_url: string | null }>();

  if (!row) {
    return notFound(c, "User not found");
  }

  return c.json({
    user: {
      id: row.id,
      handle: row.handle,
      avatarUrl: row.avatar_url,
    },
  });
});

/* -------------------------------------------------------------------------- */
/* GET /v1/me/rooms                                                            */
/* -------------------------------------------------------------------------- */

me.get("/rooms", requireAuth, async (c) => {
  const userId = c.var.userId;

  const result = await c.env.DB.prepare(
    `SELECT r.id, r.code, r.name, r.owner_id, r.org_id, r.created_at
     FROM room_members rm
     JOIN rooms r ON r.id = rm.room_id
     WHERE rm.user_id = ?
     ORDER BY rm.joined_at DESC`,
  )
    .bind(userId)
    .all<{
      id: string;
      code: string;
      name: string;
      owner_id: string;
      org_id: string | null;
      created_at: number;
    }>();

  const rooms = (result.results ?? []).map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    ownerId: r.owner_id,
    orgId: r.org_id,
    createdAt: r.created_at,
  }));

  return c.json({ rooms });
});

export default me;
