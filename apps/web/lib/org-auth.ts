/**
 * Org membership helper for server components — Phase 3 Track O.
 *
 * Checks whether the signed-in user is a member of a given org (by slug).
 * Returns the org + member role, or null if not a member / not signed in.
 *
 * Usage:
 *   const membership = await getOrgMembership(slug, cookieHeader);
 *   if (!membership) redirect("/signin");
 */

import { getCookieHeader, getSession } from "./auth";
import { getOrg, ApiError } from "./api";
import type { OrgMemberRole, GetOrgResponse } from "@token-rats/contracts";

export interface OrgMembership {
  org: GetOrgResponse["org"];
  members: GetOrgResponse["members"];
  /** The signed-in user's role in this org. */
  role: OrgMemberRole;
  userId: string;
}

/**
 * Returns the org + the current user's membership details, or null if the user
 * is not authenticated or is not a member of the org.
 *
 * Does NOT throw on 401/403 — returns null so callers can redirect gracefully.
 */
export async function getOrgMembership(
  slug: string,
  cookieHeader?: string,
): Promise<OrgMembership | null> {
  const cookie = cookieHeader ?? (await getCookieHeader());
  const user = await getSession();
  if (!user) return null;

  let data: GetOrgResponse;
  try {
    data = await getOrg(slug, cookie);
  } catch (err) {
    // 403 = not a member, 404 = no such org — both mean "no access"
    if (err instanceof ApiError) return null;
    throw err;
  }

  const member = data.members.find((m) => m.userId === user.id);
  if (!member) return null;

  return {
    org: data.org,
    members: data.members,
    role: member.role as OrgMemberRole,
    userId: user.id,
  };
}

/**
 * Like getOrgMembership but requires admin or owner role.
 * Returns null if user is only a regular member.
 */
export async function requireOrgAdmin(
  slug: string,
  cookieHeader?: string,
): Promise<OrgMembership | null> {
  const membership = await getOrgMembership(slug, cookieHeader);
  if (!membership) return null;
  if (membership.role === "member") return null;
  return membership;
}
