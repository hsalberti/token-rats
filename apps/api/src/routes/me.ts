import { PatchMeRequest } from "@token-rats/contracts";
/**
 * GET   /v1/me           — returns the authenticated user's profile.
 * PATCH /v1/me           — update publicProfile, bio, twitterHandle.
 * GET   /v1/me/rooms     — returns all rooms the authenticated user is a member of.
 * GET   /v1/me/referral  — returns the user's referral code + referred users.
 */
import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../env.js";
import { notFound, validationError } from "../lib/errors.js";
import { ensureReferralCode } from "../lib/referral.js";
import type { AuthVariables } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";

type HonoEnv = { Bindings: Env; Variables: AuthVariables };

const me = new Hono<HonoEnv>();

me.get("/", requireAuth, async (c) => {
  const userId = c.var.userId;

  const row = await c.env.DB.prepare(
    "SELECT id, handle, avatar_url, public_profile, bio, twitter_handle, twitter_user_id, email FROM users WHERE id = ?",
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
      email: string | null;
    }>();

  if (!row) {
    return notFound(c, "User not found");
  }

  return c.json({
    user: {
      id: row.id,
      handle: row.handle,
      avatarUrl: row.avatar_url,
      publicProfile: row.public_profile === 1,
      bio: row.bio,
      twitterHandle: row.twitter_handle,
      twitterVerified: row.twitter_user_id !== null,
      email: row.email,
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

  // Nothing to update — return current user unchanged.
  // twitterHandle was removed from PatchMeRequest in v1.2 — manual writes
  // are gone, OAuth + disconnect are the only mutation paths.
  if (body.publicProfile === undefined && body.bio === undefined) {
    const row = await c.env.DB.prepare(
      "SELECT id, handle, avatar_url, public_profile, bio, twitter_handle, twitter_user_id, email FROM users WHERE id = ?",
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
        email: string | null;
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
        twitterVerified: row.twitter_user_id !== null,
        email: row.email,
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

  binds.push(userId);

  await c.env.DB.prepare(`UPDATE users SET ${setClauses.join(", ")} WHERE id = ?`)
    .bind(...binds)
    .run();

  const updated = await c.env.DB.prepare(
    "SELECT id, handle, avatar_url, public_profile, bio, twitter_handle, twitter_user_id, email FROM users WHERE id = ?",
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
      email: string | null;
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
      twitterVerified: updated.twitter_user_id !== null,
      email: updated.email,
    },
  });
});

/* -------------------------------------------------------------------------- */
/* GET /v1/me/rooms                                                            */
/* -------------------------------------------------------------------------- */

me.get("/rooms", requireAuth, async (c) => {
  const userId = c.var.userId;

  const result = await c.env.DB.prepare(
    `SELECT r.id, r.code, r.name, r.owner_id, r.org_id, r.created_at,
            r.is_public, r.country
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
      is_public: number;
      country: string | null;
    }>();

  const rooms = (result.results ?? []).map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    ownerId: r.owner_id,
    orgId: r.org_id,
    createdAt: r.created_at,
    isPublic: r.is_public === 1,
    country: r.country,
  }));

  return c.json({ rooms });
});

/* -------------------------------------------------------------------------- */
/* GET /v1/me/referral                                                         */
/* -------------------------------------------------------------------------- */

const RECENT_REFERRALS_LIMIT = 20;

me.get("/referral", requireAuth, async (c) => {
  const userId = c.var.userId;

  const code = await ensureReferralCode(c.env.DB, userId);

  const countRow = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM referrals WHERE referrer_user_id = ?",
  )
    .bind(userId)
    .first<{ n: number }>();
  const count = countRow?.n ?? 0;

  const recentRes = await c.env.DB.prepare(
    `SELECT u.handle, u.avatar_url, r.created_at
       FROM referrals r
       JOIN users u ON u.id = r.referred_user_id
      WHERE r.referrer_user_id = ?
      ORDER BY r.created_at DESC
      LIMIT ?`,
  )
    .bind(userId, RECENT_REFERRALS_LIMIT)
    .all<{ handle: string; avatar_url: string | null; created_at: number }>();

  const recent = (recentRes.results ?? []).map((r) => ({
    handle: r.handle,
    avatarUrl: r.avatar_url,
    createdAt: r.created_at,
  }));

  return c.json({
    referral: { code, count, recent },
  });
});

export default me;
