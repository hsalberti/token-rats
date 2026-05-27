/**
 * /trending
 *
 * - Signed-out viewers: 301 to `/`, where the live board is the landing page.
 * - Signed-in viewers: full TrendingClient inside a dashboard shell (so the
 *   "View all" link from the /app preview card has a real destination).
 *
 * Share-card routes under `/cards/trending/...` are unaffected.
 */
import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import { AuthedTopBar } from "../../components/AuthedTopBar";
import { getTrending } from "../../lib/api";
import { getSession } from "../../lib/auth";
import { getServerLocale } from "../../lib/server-locale";
import { TrendingClient } from "./Client";

export const runtime = "edge";

export const metadata: Metadata = {
  title: "Global leaderboard",
};

type Range = "today" | "7d" | "30d";

function validateRange(raw: string | undefined): Range {
  if (raw === "7d" || raw === "30d") return raw;
  return "today";
}

export default async function TrendingPage({
  searchParams,
}: {
  searchParams?: Promise<{ range?: string }>;
}) {
  const user = await getSession();
  if (!user) {
    permanentRedirect("/");
  }

  const locale = await getServerLocale();
  const params = (await searchParams) ?? {};
  const range = validateRange(params.range);

  let rows: Awaited<ReturnType<typeof getTrending>>["rows"] = [];
  let generatedAt = Date.now();
  try {
    const data = await getTrending(range);
    rows = data.rows;
    generatedAt = data.generatedAt;
  } catch {
    // Empty board on error — better than crashing.
  }
  // Format server-side to keep SSR/CSR aligned — see /app/page.tsx for the
  // full reasoning behind the en-US pin.
  const generatedAtLabel = new Date(generatedAt).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="min-h-screen bg-zinc-950">
      <AuthedTopBar user={user} locale={locale} />

      <main className="mx-auto max-w-4xl px-6 py-8 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight">Global leaderboard</h1>
            <p className="mt-1 text-zinc-400">
              Live ranking of public Token Rats — top 100 by tokens.
            </p>
          </div>
          <a
            href="/app"
            className="shrink-0 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm font-semibold text-zinc-300 hover:border-rat-700 hover:text-rat-400 transition-colors"
          >
            ← Dashboard
          </a>
        </div>

        <TrendingClient
          initialRows={rows}
          initialRange={range}
          generatedAtLabel={generatedAtLabel}
        />
      </main>
    </div>
  );
}
