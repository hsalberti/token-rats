/**
 * v1.2 Track AE — `cf-ipcountry` helper.
 *
 * Cloudflare injects an ISO 3166-1 alpha-2 country code on every request via
 * the `cf-ipcountry` header. We normalize to uppercase and reject anything
 * that doesn't look like a two-letter code (e.g. `XX` for Tor exits, `T1`
 * for unknown networks). Callers get `null` in those cases.
 */

import type { Context } from "hono";

const COUNTRY_CODE = /^[A-Z]{2}$/;

/**
 * Read the viewer's country from the `cf-ipcountry` request header.
 * Returns the uppercase ISO 3166-1 alpha-2 code, or `null` if the header
 * is missing or doesn't match the expected shape (e.g. `XX`, `T1`).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getViewerCountry(c: Context<any, any, any>): string | null {
  const raw = c.req.header("cf-ipcountry");
  if (!raw) return null;
  const upper = raw.trim().toUpperCase();
  if (!COUNTRY_CODE.test(upper)) return null;
  return upper;
}
