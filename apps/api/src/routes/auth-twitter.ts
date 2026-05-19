/**
 * v1.2 Track AC — Twitter/X OAuth 2.0 (PKCE) verification routes.
 *
 *   GET  /v1/auth/twitter/start         – start PKCE flow, redirect to X
 *   GET  /v1/auth/twitter/callback      – exchange code, upsert handle + user_id
 *   POST /v1/me/twitter/disconnect      – null out the three columns
 *
 * Scope is read-only (`tweet.read users.read`). We only persist the verified
 * X user_id + handle; no access tokens are stored.
 */

import { Hono } from "hono";
import type { Env } from "../env.js";
import type { AuthVariables } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";
import { randomBase64url } from "../lib/auth.js";

type HonoEnv = { Bindings: Env; Variables: AuthVariables };

const twitter = new Hono<HonoEnv>();

const PKCE_TTL_SECONDS = 600; // 10 minutes
const KV_PREFIX = "tw_pkce:";
const SCOPE = "tweet.read users.read";

/** SHA-256 + base64url — the PKCE `code_challenge` derivation. */
async function s256Challenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function callbackUrl(c: { req: { url: string } }): string {
  return `${new URL(c.req.url).origin}/v1/auth/twitter/callback`;
}

function redirectToSettings(env: Env, status: "connected" | "failed"): Response {
  return Response.redirect(`${env.WEB_ORIGIN}/settings/profile?twitter=${status}`, 302);
}

/* -------------------------------------------------------------------------- */
/* GET /v1/auth/twitter/start                                                 */
/* -------------------------------------------------------------------------- */

twitter.get("/auth/twitter/start", requireAuth, async (c) => {
  if (!c.env.X_OAUTH_CLIENT_ID || !c.env.X_OAUTH_CLIENT_SECRET) {
    return c.json(
      {
        error: {
          code: "not_configured",
          message: "Twitter integration not configured",
        },
      },
      503,
    );
  }

  const userId = c.var.userId;
  const verifier = randomBase64url(48); // 64 chars b64url — well within PKCE 43-128 range
  const state = randomBase64url(24);
  const challenge = await s256Challenge(verifier);

  // KV stores {verifier, state} keyed by userId so the callback can validate
  // both ownership and the state parameter X echoes back.
  await c.env.CACHE.put(`${KV_PREFIX}${userId}`, JSON.stringify({ verifier, state }), {
    expirationTtl: PKCE_TTL_SECONDS,
  });

  const params = new URLSearchParams({
    response_type: "code",
    client_id: c.env.X_OAUTH_CLIENT_ID,
    redirect_uri: callbackUrl(c),
    scope: SCOPE,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });

  return c.redirect(`https://twitter.com/i/oauth2/authorize?${params.toString()}`, 302);
});

/* -------------------------------------------------------------------------- */
/* GET /v1/auth/twitter/callback                                              */
/* -------------------------------------------------------------------------- */

twitter.get("/auth/twitter/callback", requireAuth, async (c) => {
  if (!c.env.X_OAUTH_CLIENT_ID || !c.env.X_OAUTH_CLIENT_SECRET) {
    return redirectToSettings(c.env, "failed");
  }

  const userId = c.var.userId;
  const url = new URL(c.req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return redirectToSettings(c.env, "failed");
  }

  // Validate PKCE record
  const raw = await c.env.CACHE.get(`${KV_PREFIX}${userId}`);
  if (!raw) {
    return redirectToSettings(c.env, "failed");
  }
  let pkce: { verifier: string; state: string };
  try {
    pkce = JSON.parse(raw) as { verifier: string; state: string };
  } catch {
    return redirectToSettings(c.env, "failed");
  }
  if (pkce.state !== state) {
    return redirectToSettings(c.env, "failed");
  }
  // One-shot — delete now so a replayed callback can't re-exchange.
  await c.env.CACHE.delete(`${KV_PREFIX}${userId}`);

  // Exchange code for access token. Basic auth header carries the client
  // credentials per X's confidential-client guidance.
  const basic = btoa(`${c.env.X_OAUTH_CLIENT_ID}:${c.env.X_OAUTH_CLIENT_SECRET}`);
  const tokenBody = new URLSearchParams({
    code,
    grant_type: "authorization_code",
    client_id: c.env.X_OAUTH_CLIENT_ID,
    redirect_uri: callbackUrl(c),
    code_verifier: pkce.verifier,
  });

  let accessToken: string;
  try {
    const tokenRes = await fetch("https://api.twitter.com/2/oauth2/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: tokenBody.toString(),
    });
    if (!tokenRes.ok) {
      return redirectToSettings(c.env, "failed");
    }
    const tokenData = (await tokenRes.json()) as { access_token?: string };
    if (!tokenData.access_token) {
      return redirectToSettings(c.env, "failed");
    }
    accessToken = tokenData.access_token;
  } catch {
    return redirectToSettings(c.env, "failed");
  }

  // Fetch the verified X user.
  let twitterUserId: string;
  let twitterHandle: string;
  try {
    const meRes = await fetch("https://api.twitter.com/2/users/me?user.fields=username", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });
    if (!meRes.ok) {
      return redirectToSettings(c.env, "failed");
    }
    const meData = (await meRes.json()) as {
      data?: { id?: string; username?: string };
    };
    if (!meData.data?.id || !meData.data.username) {
      return redirectToSettings(c.env, "failed");
    }
    twitterUserId = meData.data.id;
    twitterHandle = meData.data.username;
  } catch {
    return redirectToSettings(c.env, "failed");
  }

  // Upsert into users. We assume the columns added by migration 0010 are
  // present. `twitter_user_id` has a unique partial index, so if another
  // account already claimed this X identity we surface a friendly failure.
  const now = Date.now();
  try {
    await c.env.DB.prepare(
      `UPDATE users
         SET twitter_user_id     = ?,
             twitter_handle      = ?,
             twitter_verified_at = ?
       WHERE id = ?`,
    )
      .bind(twitterUserId, twitterHandle, now, userId)
      .run();
  } catch {
    return redirectToSettings(c.env, "failed");
  }

  return redirectToSettings(c.env, "connected");
});

/* -------------------------------------------------------------------------- */
/* POST /v1/me/twitter/disconnect                                             */
/* -------------------------------------------------------------------------- */

twitter.post("/me/twitter/disconnect", requireAuth, async (c) => {
  const userId = c.var.userId;

  await c.env.DB.prepare(
    `UPDATE users
       SET twitter_user_id     = NULL,
           twitter_handle      = NULL,
           twitter_verified_at = NULL
     WHERE id = ?`,
  )
    .bind(userId)
    .run();

  return c.json({ ok: true });
});

export default twitter;
