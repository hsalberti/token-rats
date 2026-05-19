/**
 * Auth routes:
 *  GET  /v1/auth/github/start       – start GitHub OAuth (browser)
 *  GET  /v1/auth/github/callback    – GitHub OAuth callback (browser)
 *  POST /v1/auth/cli/exchange       – mint CLI device code
 *  POST /v1/auth/cli/approve        – approve device code (cookie-auth)
 *  POST /v1/auth/cli/poll           – poll for CLI token
 */

import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { z } from "zod";
import type { Env } from "../env.js";
import {
  SESSION_COOKIE,
  TOKEN_TTL_CLI,
  TOKEN_TTL_WEB,
  cookieDomainFor,
  randomBase64url,
  randomVerificationCode,
  signToken,
} from "../lib/auth.js";
import {
  authRequired,
  gone,
  internalError,
  notFound,
  rateLimited,
  validationError,
} from "../lib/errors.js";
import { rateLimit } from "../lib/rate-limit.js";
import {
  ensureReferralCode,
  isValidReferralCodeFormat,
  recordReferral,
  referrerIdForCode,
} from "../lib/referral.js";
import type { AuthVariables } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";

type HonoEnv = { Bindings: Env; Variables: AuthVariables };

const auth = new Hono<HonoEnv>();

/* -------------------------------------------------------------------------- */
/* GET /v1/auth/github/start                                                  */
/* -------------------------------------------------------------------------- */

auth.get("/github/start", async (c) => {
  const state = randomBase64url(24);
  const stateKey = `oauth:state:${state}`;

  // Optional affiliate / referral code carried through OAuth via KV state.
  // Only stored if format-valid; we'll re-validate against the DB on callback.
  const refRaw = c.req.query("ref");
  const ref = refRaw && isValidReferralCodeFormat(refRaw) ? refRaw : null;

  await c.env.CACHE.put(stateKey, JSON.stringify({ ref }), { expirationTtl: 600 });

  // Callback lives on this Worker (not the web app), so derive from request.
  const apiOrigin = new URL(c.req.url).origin;

  const params = new URLSearchParams({
    client_id: c.env.GITHUB_CLIENT_ID,
    redirect_uri: `${apiOrigin}/v1/auth/github/callback`,
    scope: "read:user",
    state,
  });

  return c.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`, 302);
});

/* -------------------------------------------------------------------------- */
/* GET /v1/auth/github/callback                                               */
/* -------------------------------------------------------------------------- */

auth.get("/github/callback", async (c) => {
  const url = new URL(c.req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return c.text("Missing code or state", 400);
  }

  // Verify state
  const stateKey = `oauth:state:${state}`;
  const stateVal = await c.env.CACHE.get(stateKey);
  if (!stateVal) {
    return c.text("Invalid or expired state", 400);
  }
  // Delete immediately (one-time use)
  await c.env.CACHE.delete(stateKey);

  // Older state records were just "1"; new records are JSON `{ ref: string | null }`.
  let refCode: string | null = null;
  if (stateVal.startsWith("{")) {
    try {
      const parsed = JSON.parse(stateVal) as { ref?: string | null };
      if (typeof parsed.ref === "string" && isValidReferralCodeFormat(parsed.ref)) {
        refCode = parsed.ref;
      }
    } catch {
      // ignore — treat as no ref
    }
  }

  // Exchange code for access token
  let accessToken: string;
  try {
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: c.env.GITHUB_CLIENT_ID,
        client_secret: c.env.GITHUB_CLIENT_SECRET,
        code,
      }),
    });
    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
      error?: string;
    };
    if (!tokenData.access_token) {
      return c.text(`GitHub OAuth failed: ${tokenData.error ?? "unknown"}`, 400);
    }
    accessToken = tokenData.access_token;
  } catch {
    return c.text("Failed to exchange code with GitHub", 502);
  }

  // Fetch user info from GitHub
  let ghUser: { id: number; login: string; avatar_url: string };
  try {
    const userRes = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": "token-rats-api/1.0",
        Accept: "application/vnd.github+json",
      },
    });
    if (!userRes.ok) {
      return c.text("Failed to fetch GitHub user info", 502);
    }
    ghUser = (await userRes.json()) as {
      id: number;
      login: string;
      avatar_url: string;
    };
  } catch {
    return c.text("Failed to fetch GitHub user info", 502);
  }

  // Upsert user in D1
  const now = Date.now();
  const newId = crypto.randomUUID();

  // Try to find existing user by github_id
  const existing = await c.env.DB.prepare(
    "SELECT id, handle, avatar_url FROM users WHERE github_id = ?",
  )
    .bind(ghUser.id)
    .first<{ id: string; handle: string; avatar_url: string | null }>();

  let userId: string;

  if (existing) {
    // Update avatar_url in case it changed
    await c.env.DB.prepare("UPDATE users SET avatar_url = ? WHERE id = ?")
      .bind(ghUser.avatar_url ?? null, existing.id)
      .run();
    userId = existing.id;
  } else {
    // Insert new user; handle = github login
    await c.env.DB.prepare(
      "INSERT INTO users (id, github_id, handle, avatar_url, created_at) VALUES (?, ?, ?, ?, ?)",
    )
      .bind(newId, ghUser.id, ghUser.login, ghUser.avatar_url ?? null, now)
      .run();
    userId = newId;

    // Allocate this user's own referral code up front so they can share immediately.
    try {
      await ensureReferralCode(c.env.DB, userId);
    } catch {
      // Non-fatal — code can be allocated lazily on first /v1/me/referral read.
    }

    // If they arrived via someone else's ref link, record the directed edge.
    if (refCode) {
      const referrerId = await referrerIdForCode(c.env.DB, refCode);
      if (referrerId) {
        await recordReferral(c.env.DB, userId, referrerId, now);
      }
    }
  }

  // Mint session token
  const token = await signToken(userId, c.env.SESSION_SIGNING_KEY, TOKEN_TTL_WEB);

  // Domain is set to the apex (e.g. "tokenrats.com") so the cookie is shared
  // between the web origin and the api.* subdomain. On localhost the helper
  // returns undefined and the cookie acts as a normal host cookie.
  const domain = cookieDomainFor(c.env.WEB_ORIGIN);
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    ...(domain && { domain }),
  });

  return c.redirect(`${c.env.WEB_ORIGIN}/app`, 302);
});

/* -------------------------------------------------------------------------- */
/* POST /v1/auth/cli/exchange                                                  */
/* -------------------------------------------------------------------------- */

auth.post("/cli/exchange", async (c) => {
  // Rate limit: 5 requests/min per IP — prevents flooding KV with device codes.
  const ip = c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? "unknown";
  const rl = await rateLimit(c.env.CACHE, `cli-exchange:${ip}`, 5);
  if (!rl.allowed) return rateLimited(c);

  const pollToken = randomBase64url(32);
  const verificationCode = randomVerificationCode();

  const record = JSON.stringify({
    status: "pending",
    verificationCode,
    userId: null,
  });

  // keyed by pollToken and by verificationCode → pollToken
  await c.env.CACHE.put(`cli:poll:${pollToken}`, record, {
    expirationTtl: 600,
  });
  await c.env.CACHE.put(`cli:code:${verificationCode}`, pollToken, {
    expirationTtl: 600,
  });

  return c.json(
    {
      verificationUrl: `${c.env.WEB_ORIGIN}/cli?code=${verificationCode}`,
      pollToken,
      expiresIn: 600,
    },
    200,
  );
});

/* -------------------------------------------------------------------------- */
/* POST /v1/auth/cli/approve  (cookie-auth required)                          */
/* -------------------------------------------------------------------------- */

const ApproveBody = z.object({ verificationCode: z.string().min(1) });

auth.post("/cli/approve", requireAuth, async (c) => {
  const userId = c.var.userId;

  let body: { verificationCode: string };
  try {
    const raw: unknown = await c.req.json();
    body = ApproveBody.parse(raw);
  } catch (e) {
    return validationError(c, e instanceof Error ? e.message : e);
  }

  const pollToken = await c.env.CACHE.get(`cli:code:${body.verificationCode}`);
  if (!pollToken) {
    return notFound(c, "Verification code not found or expired");
  }

  const raw = await c.env.CACHE.get(`cli:poll:${pollToken}`);
  if (!raw) {
    return notFound(c, "Poll token not found or expired");
  }

  const record = JSON.parse(raw) as {
    status: string;
    verificationCode: string;
    userId: string | null;
  };

  const updated = JSON.stringify({
    ...record,
    status: "approved",
    userId,
  });

  // Keep the same TTL approximately (we just overwrite — KV resets TTL on put)
  await c.env.CACHE.put(`cli:poll:${pollToken}`, updated, {
    expirationTtl: 600,
  });

  return c.json({ ok: true }, 200);
});

/* -------------------------------------------------------------------------- */
/* POST /v1/auth/cli/poll                                                      */
/* -------------------------------------------------------------------------- */

const PollBody = z.object({ pollToken: z.string().min(1) });

auth.post("/cli/poll", async (c) => {
  let body: { pollToken: string };
  try {
    const raw: unknown = await c.req.json();
    body = PollBody.parse(raw);
  } catch (e) {
    return validationError(c, e instanceof Error ? e.message : e);
  }

  const raw = await c.env.CACHE.get(`cli:poll:${body.pollToken}`);
  if (!raw) {
    // Expired or already consumed
    return gone(c, "Poll token expired or already used");
  }

  const record = JSON.parse(raw) as {
    status: string;
    verificationCode: string;
    userId: string | null;
  };

  if (record.status === "pending") {
    return c.json({ status: "pending" }, 202);
  }

  if (record.status === "approved" && record.userId) {
    // Mint a CLI token and delete KV records
    const token = await signToken(record.userId, c.env.SESSION_SIGNING_KEY, TOKEN_TTL_CLI);

    // Clean up KV
    await c.env.CACHE.delete(`cli:poll:${body.pollToken}`);
    if (record.verificationCode) {
      await c.env.CACHE.delete(`cli:code:${record.verificationCode}`);
    }

    return c.json({ token }, 200);
  }

  return internalError(c, "Unexpected poll record state");
});

export default auth;
