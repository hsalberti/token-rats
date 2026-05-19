/**
 * Server-side locale detection. Reads `Accept-Language` from the incoming
 * request via `next/headers` and passes it to {@link pickLocale}. Used by
 * server components/pages; client components receive the result as a prop.
 */

import { headers } from "next/headers";
import { type Locale, pickLocale } from "./i18n";

export async function getServerLocale(): Promise<Locale> {
  const h = await headers();
  return pickLocale(h.get("accept-language"));
}
