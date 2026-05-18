/**
 * /trending — global leaderboard of public users.
 * Server-rendered; range is passed as a searchParam.
 */
import type { Metadata } from "next";
import { getTrending } from "@/lib/api";
import { TrendingClient } from "./Client";

export const runtime = "edge";

interface Props {
  searchParams: Promise<{ range?: string }>;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { range = "today" } = await searchParams;
  const rangeLabel = range === "7d" ? "7-day" : range === "30d" ? "30-day" : "today's";
  const cardUrl = `/cards/trending/${range}`;

  return {
    title: `Trending Token Rats — ${rangeLabel} top burners`,
    description: `See who's burning the most AI tokens ${rangeLabel}. The global leaderboard of public Token Rats.`,
    openGraph: {
      title: `Trending Token Rats`,
      description: `Top public token burners for ${rangeLabel}.`,
      images: [{ url: cardUrl, width: 1200, height: 630, alt: `Token Rats Trending — ${rangeLabel}` }],
    },
    twitter: {
      card: "summary_large_image",
      title: `Trending Token Rats`,
      description: `Top public token burners for ${rangeLabel}.`,
      images: [cardUrl],
    },
  };
}

function validateRange(raw: string | undefined): "today" | "7d" | "30d" {
  if (raw === "7d" || raw === "30d") return raw;
  return "today";
}

export default async function TrendingPage({ searchParams }: Props) {
  const { range: rawRange = "today" } = await searchParams;
  const range = validateRange(rawRange);

  let rows: Array<{
    rank: number;
    userId: string;
    handle: string;
    avatarUrl: string | null;
    tokens: number;
    costUsdCents: number;
    sessions: number;
  }> = [];

  let generatedAt = Date.now();

  try {
    const data = await getTrending(range);
    rows = data.rows;
    generatedAt = data.generatedAt;
  } catch {
    // Render with empty state on error
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <a href="/" className="text-sm text-zinc-500 hover:text-zinc-300">
            &larr; Home
          </a>
          <a href="/" className="text-lg font-black tracking-tight">
            Token <span className="text-rat-500">Rats</span>
          </a>
          <div className="w-16" />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-black tracking-tight mb-2">Trending Rats</h1>
          <p className="text-zinc-400">
            Global leaderboard of public token burners. Opt-in only.
          </p>
        </div>

        <TrendingClient initialRows={rows} initialRange={range} generatedAt={generatedAt} />
      </main>
    </div>
  );
}
