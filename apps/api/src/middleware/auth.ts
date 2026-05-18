/**
 * Auth middleware — supports two token carriers:
 *   1. `__Host-tr_session` cookie   (browser / web flow)
 *   2. `Authorization: Bearer <token>` header  (CLI flow)
 *
 * Attaches `c.var.userId` when a valid token is found.
 * `requireAuth` middleware rejects with 401 if no valid token.
 */

import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import { verifyToken, SESSION_COOKIE } from "../lib/auth.js";
import { authRequired } from "../lib/errors.js";
import type { Env } from "../env.js";

export type AuthVariables = {
  userId: string;
};

type HonoCtx = Context<{ Bindings: Env; Variables: AuthVariables }>;

/** Extract and verify the token from cookie or Bearer header. Returns userId or null. */
export async function extractUserId(
  c: Context<{ Bindings: Env; Variables: AuthVariables }>,
): Promise<string | null> {
  let token: string | undefined;

  // 1. Try cookie
  const cookieToken = getCookie(c, SESSION_COOKIE);
  if (cookieToken) {
    token = cookieToken;
  } else {
    // 2. Try Authorization header
    const authHeader = c.req.header("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.slice(7);
    }
  }

  if (!token) return null;

  const result = await verifyToken(token, c.env.SESSION_SIGNING_KEY);
  if (!result.ok) {
    // Surface why so logs can distinguish an expired session (user
    // experience: needs re-sign-in) from a tampered/malformed cookie
    // (user experience: probably a bug or someone fuzzing).
    console.warn("[auth] token rejected", { reason: result.reason });
    return null;
  }
  return result.userId;
}

/**
 * Middleware that populates c.var.userId if a token is present, but does NOT
 * reject the request (useful for auth-optional endpoints).
 */
export async function optionalAuth(c: HonoCtx, next: Next): Promise<Response | void> {
  const userId = await extractUserId(c);
  if (userId) c.set("userId", userId);
  return next();
}

/**
 * Middleware that rejects with 401 if no valid token is present.
 */
export async function requireAuth(c: HonoCtx, next: Next): Promise<Response | void> {
  const userId = await extractUserId(c);
  if (!userId) return authRequired(c);
  c.set("userId", userId);
  return next();
}
