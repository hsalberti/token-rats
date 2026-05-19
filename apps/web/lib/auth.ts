/**
 * Auth helpers for server components.
 * The session cookie is `tr_session`, set by the Worker API with
 * Domain=<apex> so it's shared between the web origin and the api.* subdomain.
 */

import type { User } from "@token-rats/contracts";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { API_URL, getMe } from "./api";

export const SESSION_COOKIE = "tr_session";
/** Set by /v1/auth/github/start?intent=email_reauth so the interstitial fires once. */
export const EMAIL_REAUTH_COOKIE = "tr_email_reauth_seen";

/**
 * Returns the current user or null.
 * Passes the session cookie through to the API.
 */
export async function getSession(): Promise<User | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE);
  if (!sessionCookie) return null;

  try {
    const cookieHeader = `${SESSION_COOKIE}=${sessionCookie.value}`;
    const data = await getMe(cookieHeader);
    return data.user;
  } catch {
    return null;
  }
}

/**
 * Returns the current user; redirects to /signin if unauthenticated.
 *
 * v1.2 — also one-shot redirects users created before the `user:email`
 * OAuth-scope bump back through GitHub to capture their primary verified
 * email. The cookie `tr_email_reauth_seen` is set by the API the moment we
 * issue the redirect, so this fires at most once per browser regardless of
 * whether the user accepts or declines at GitHub.
 */
export async function requireSession(): Promise<User> {
  const user = await getSession();
  if (!user) redirect("/signin");

  if (user.email == null) {
    const cookieStore = await cookies();
    const alreadyTried = cookieStore.get(EMAIL_REAUTH_COOKIE);
    if (!alreadyTried) {
      redirect(`${API_URL}/v1/auth/github/start?intent=email_reauth`);
    }
  }

  return user;
}

/**
 * Returns the cookie header string for passing to API calls in server components.
 */
export async function getCookieHeader(): Promise<string> {
  const cookieStore = await cookies();
  return cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}
