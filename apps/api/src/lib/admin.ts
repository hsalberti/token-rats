/**
 * Admin gate — used by `/v1/admin/*` routes.
 *
 * Strategy (simplest workable option):
 *   - Administrators are identified by a comma-separated list of GitHub
 *     logins in the `ADMIN_GITHUB_LOGIN` Worker secret/var.
 *   - Those logins are compared against `users.handle`, which is populated from
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
 * Returns true iff the given user is in the configured admin allowlist.
 *
 * Looks up `handle` in `users` and compares against the comma-separated
 * `ADMIN_GITHUB_LOGIN` allowlist. Case-insensitive (GitHub logins are
 * case-insensitive in practice).
 */
export async function isAdmin(env: Env, userId: string): Promise<boolean> {
  const adminLogins = env.ADMIN_GITHUB_LOGIN?.split(",")
    .map((login) => login.trim().toLowerCase())
    .filter(Boolean);
  if (!adminLogins || adminLogins.length === 0) return false;

  const row = await env.DB.prepare("SELECT handle FROM users WHERE id = ?")
    .bind(userId)
    .first<{ handle: string }>();
  if (!row) return false;

  return adminLogins.includes(row.handle.toLowerCase());
}
