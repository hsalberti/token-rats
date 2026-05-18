/**
 * token-rats logout
 *
 * Deletes the stored auth token.
 */

import { deleteToken, isLoggedIn } from "../lib/auth-store.js";
import { info, warn } from "../lib/log.js";

export function logoutCommand(): void {
  if (!isLoggedIn()) {
    warn("You are not currently logged in.");
    return;
  }
  deleteToken();
  info("Logged out. Your local token has been removed.");
}
