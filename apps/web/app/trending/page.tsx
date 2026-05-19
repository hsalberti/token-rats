/**
 * /trending used to be the standalone live-board page; the live board is now
 * the signed-out homepage at `/`. This page becomes a 301 to `/` for all
 * viewers. Share-card routes under `/cards/trending/...` are unaffected.
 */
import { permanentRedirect } from "next/navigation";

export const runtime = "edge";

export default function TrendingPage({
  searchParams,
}: {
  searchParams?: Promise<{ range?: string }>;
}) {
  // The page-component shape changed from async-with-range to a pass-through;
  // we keep `searchParams` declared so Next infers the right type signature,
  // but we don't need to read it.
  void searchParams;
  permanentRedirect("/");
}
