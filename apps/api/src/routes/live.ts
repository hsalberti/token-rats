/**
 * GET /v1/rooms/:code/live
 *
 * Server-Sent Events (SSE) endpoint. Auth-gated (room members only).
 * Forwards to the RoomLiveHub Durable Object's /subscribe route.
 */

import { Hono } from "hono";
import type { Env } from "../env.js";
import type { AuthVariables } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";
import { forbidden, notFound } from "../lib/errors.js";

type HonoEnv = { Bindings: Env; Variables: AuthVariables };

const live = new Hono<HonoEnv>();

live.get("/:code/live", requireAuth, async (c) => {
  const userId = c.var.userId;
  const code = c.req.param("code");

  // Verify the room exists
  const room = await c.env.DB.prepare("SELECT id FROM rooms WHERE code = ?")
    .bind(code)
    .first<{ id: string }>();

  if (!room) {
    return notFound(c, "Room not found");
  }

  // Verify the caller is a member
  const membership = await c.env.DB.prepare(
    "SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?",
  )
    .bind(room.id, userId)
    .first();

  if (!membership) {
    return forbidden(c, "Not a member of this room");
  }

  // Forward to the Durable Object for this room
  const id = c.env.ROOM_LIVE.idFromName(code);
  const stub = c.env.ROOM_LIVE.get(id);

  const doUrl = new URL(c.req.url);
  doUrl.pathname = "/subscribe";

  return stub.fetch(new Request(doUrl.toString(), { method: "GET" }));
});

export default live;
