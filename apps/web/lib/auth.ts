/**
 * Auth helpers for server components.
 * The session cookie is `tr_session`, set by the Worker API with
 * Domain=<apex> so it's shared between the web origin and the api.* subdomain.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getMe } from "./api";
import type { User } from "@token-rats/contracts";

export const SESSION_COOKIE = "tr_session";

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
 */
export async function requireSession(): Promise<User> {
  const user = await getSession();
  if (!user) redirect("/signin");
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
