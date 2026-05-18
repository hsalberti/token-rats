/**
 * GET /v1/me — returns the authenticated user's profile.
 */
import { Hono } from "hono";
import type { Env } from "../env.js";
import type { AuthVariables } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";
import { notFound } from "../lib/errors.js";

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

export default me;
