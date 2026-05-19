/**
 * Admin gate — used by `/v1/admin/*` routes.
 *
 * Strategy (simplest workable option):
 *   - Project owner is identified by a single GitHub login set in the
 *     `ADMIN_GITHUB_LOGIN` Worker secret/var.
 *   - That login is compared against `users.handle`, which is populated from
 *     the GitHub `login` field at OAuth callback (see routes/auth.ts).
 *   - When `ADMIN_GITHUB_LOGIN` is unset, no one is an admin (fail closed).
 *
 * Why not a DB column?  This is launch-day tooling for a single owner — a
 * Worker secret keeps the bar to grant access at "rotate a secret" rather
 * than "ship a migration + a UI", and is consistent with how the existing
 * stack already gates rare privileged paths.
 */
import type { Env } from "../env.js";

/**
 * Returns true iff the given user is the configured project owner.
 *
 * Looks up `handle` in `users` and compares against `ADMIN_GITHUB_LOGIN`.
 * Case-insensitive (GitHub logins are case-insensitive in practice).
 */
export async function isAdmin(env: Env, userId: string): Promise<boolean> {
  const adminLogin = env.ADMIN_GITHUB_LOGIN;
  if (!adminLogin || adminLogin.trim() === "") return false;

  const row = await env.DB.prepare("SELECT handle FROM users WHERE id = ?")
    .bind(userId)
    .first<{ handle: string }>();
  if (!row) return false;

  return row.handle.toLowerCase() === adminLogin.trim().toLowerCase();
}
