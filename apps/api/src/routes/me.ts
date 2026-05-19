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
import { PatchMeRequest } from "@token-rats/contracts";
import { getPrimarySourceForUser } from "../lib/primary-source.js";

type HonoEnv = { Bindings: Env; Variables: AuthVariables };

const me = new Hono<HonoEnv>();

me.get("/", requireAuth, async (c) => {
  const userId = c.var.userId;

  const row = await c.env.DB.prepare(
    `SELECT id, handle, avatar_url, public_profile, bio,
            twitter_handle, twitter_user_id, twitter_verified_at, email
       FROM users
      WHERE id = ?`,
  )
    .bind(userId)
    .first<{
      id: string;
      handle: string;
      avatar_url: string | null;
      public_profile: number;
      bio: string | null;
      twitter_handle: string | null;
      twitter_user_id: string | null;
      twitter_verified_at: number | null;
      email: string | null;
    }>();

  if (!row) {
    return notFound(c, "User not found");
  }

  // v1.2 Track AF — primary-source pill on the signed-in user's own record.
  const primarySource = await getPrimarySourceForUser(c.env.DB, c.env.CACHE, row.id).catch(
    () => null,
  );

  return c.json({
    user: {
      id: row.id,
      handle: row.handle,
      avatarUrl: row.avatar_url,
      publicProfile: row.public_profile === 1,
      bio: row.bio,
      twitterHandle: row.twitter_handle,
      twitterVerified: row.twitter_verified_at !== null,
      email: row.email,
      primarySource,
    },
  });
});

/* -------------------------------------------------------------------------- */
/* PATCH /v1/me                                                                */
/* -------------------------------------------------------------------------- */

me.patch("/", requireAuth, async (c) => {
  const userId = c.var.userId;

  let body: z.infer<typeof PatchMeRequest>;
  try {
    const raw = await c.req.json();
    body = PatchMeRequest.parse(raw);
  } catch (err) {
    return validationError(c, err instanceof z.ZodError ? err.issues : String(err));
  }

  // Nothing to update — return current user unchanged
  if (
    body.publicProfile === undefined &&
    body.bio === undefined &&
    body.twitterHandle === undefined
  ) {
    const row = await c.env.DB.prepare(
      `SELECT id, handle, avatar_url, public_profile, bio, twitter_handle, twitter_verified_at
         FROM users WHERE id = ?`,
    )
      .bind(userId)
      .first<{
        id: string;
        handle: string;
        avatar_url: string | null;
        public_profile: number;
        bio: string | null;
        twitter_handle: string | null;
        twitter_verified_at: number | null;
      }>();
    if (!row) return notFound(c, "User not found");
    return c.json({
      user: {
        id: row.id,
        handle: row.handle,
        avatarUrl: row.avatar_url,
        publicProfile: row.public_profile === 1,
        bio: row.bio,
        twitterHandle: row.twitter_handle,
        twitterVerified: row.twitter_verified_at !== null,
      },
    });
  }

  // Build the SET clause dynamically
  const setClauses: string[] = [];
  const binds: (string | number | null)[] = [];

  if (body.publicProfile !== undefined) {
    setClauses.push("public_profile = ?");
    binds.push(body.publicProfile ? 1 : 0);
  }
  if (body.bio !== undefined) {
    setClauses.push("bio = ?");
    binds.push(body.bio ?? null);
  }
  if (body.twitterHandle !== undefined) {
    // Manual handle edits clear the verified state — verification is owned by
    // the OAuth callback in routes/auth-twitter.ts. Nulling these together
    // keeps `twitterVerified` accurate without a separate code path.
    setClauses.push("twitter_handle = ?", "twitter_user_id = NULL", "twitter_verified_at = NULL");
    binds.push(body.twitterHandle ?? null);
  }

  binds.push(userId);

  await c.env.DB.prepare(`UPDATE users SET ${setClauses.join(", ")} WHERE id = ?`)
    .bind(...binds)
    .run();

  const updated = await c.env.DB.prepare(
    `SELECT id, handle, avatar_url, public_profile, bio, twitter_handle, twitter_verified_at
       FROM users WHERE id = ?`,
  )
    .bind(userId)
    .first<{
      id: string;
      handle: string;
      avatar_url: string | null;
      public_profile: number;
      bio: string | null;
      twitter_handle: string | null;
      twitter_verified_at: number | null;
    }>();

  if (!updated) return notFound(c, "User not found");

  return c.json({
    user: {
      id: updated.id,
      handle: updated.handle,
      avatarUrl: updated.avatar_url,
      publicProfile: updated.public_profile === 1,
      bio: updated.bio,
      twitterHandle: updated.twitter_handle,
      twitterVerified: updated.twitter_verified_at !== null,
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
