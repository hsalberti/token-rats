/**
 * / — signed-out homepage.
 *
 * Track Z: replaces the static marketing page with the live global trending
 * leaderboard. Signed-in users redirect to `/app`. Layout:
 *   - slim hero (one-liner + `npx token-rats sync` + Sign in with GitHub)
 *   - live <TrendingClient /> (today / 7d / 30d tabs, KV-cached server fetch)
 *   - "your room could be here" footer CTA
 *
 * `/trending` still works as a deep-link with its own OG card/meta.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { InstallBlock } from "../components/InstallBlock";
import { AUTH_GITHUB_START, getTrending } from "../lib/api";
import { getSession } from "../lib/auth";
import { TrendingClient } from "./trending/Client";

export const runtime = "edge";

export const metadata: Metadata = {
  title: "Token Rats — live AI token leaderboard",
  description:
    "The live global leaderboard of AI token burn. See who is spending the most on Claude Code and Cursor today, this week, and this month.",
  openGraph: {
    title: "Token Rats — live AI token leaderboard",
    description: "The live global leaderboard of AI token burn.",
    images: [
      {
        url: "/cards/trending/7d",
        width: 1200,
        height: 630,
        alt: "Token Rats Trending — 7-day top burners",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Token Rats — live AI token leaderboard",
    description: "The live global leaderboard of AI token burn.",
    images: ["/cards/trending/7d"],
  },
};

export default async function HomePage() {
  const user = await getSession();
  if (user) redirect("/app");

  // Server-fetch the default range; client component takes over on tab switch.
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
    const data = await getTrending("today");
    rows = data.rows;
    generatedAt = data.generatedAt;
  } catch {
    // Render with empty state on error — never block the page.
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Slim top nav */}
      <nav className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/85 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-3">
          <span className="text-lg font-black tracking-tight">
            Token <span className="text-rat-500">Rats</span>
          </span>
          <a
            href={AUTH_GITHUB_START}
            className="rounded-lg bg-rat-500 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-rat-600 active:bg-rat-700"
          >
            Sign in with GitHub
          </a>
        </div>
      </nav>

      <main className="mx-auto max-w-3xl px-6 py-10 sm:py-12">
        {/* Slim hero */}
        <section className="mb-10 text-center sm:mb-12">
          <h1 className="mb-3 text-3xl font-black tracking-tight sm:text-4xl">
            Strava for AI token burn.
          </h1>
          <p className="mx-auto mb-6 max-w-lg text-sm text-zinc-400 sm:text-base">
            Auto-sync your Claude Code and Cursor usage. See how you stack up against the world.
            Every row below is a real developer.
          </p>
          <div className="mx-auto max-w-md">
            <InstallBlock />
          </div>
          <p className="mt-3 text-xs text-zinc-500">
            Counts only — we can&apos;t read your prompts.{" "}
            <a
              href="https://github.com/hsalberti/token-rats"
              target="_blank"
              rel="noopener noreferrer"
              className="text-rat-400 hover:text-rat-300 underline"
            >
              Open source.
            </a>
          </p>
        </section>

        {/* Live trending board */}
        <section>
          <div className="mb-6">
            <h2 className="text-2xl font-black tracking-tight">Trending Rats</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Global leaderboard of public token burners. Opt-in only.
            </p>
          </div>
          <TrendingClient initialRows={rows} initialRange="today" generatedAt={generatedAt} />
        </section>

        {/* "Your room could be here" footer CTA */}
        <section className="mt-16 rounded-2xl border border-rat-800/60 bg-rat-900/10 px-6 py-10 text-center">
          <h2 className="mb-2 text-2xl font-black tracking-tight">Your room could be here.</h2>
          <p className="mx-auto mb-6 max-w-md text-sm text-zinc-400">
            Sign in, invite your crew, and put your rank up in lights. Free forever for individuals.
          </p>
          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href={AUTH_GITHUB_START}
              className="inline-flex items-center gap-2 rounded-xl bg-rat-500 px-6 py-3 text-base font-bold text-white shadow-lg shadow-rat-900/50 transition-colors hover:bg-rat-600 active:bg-rat-700"
            >
              <GitHubIcon />
              Create your room
            </a>
            <a
              href="/cli"
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 px-6 py-3 text-base font-semibold text-zinc-200 transition-colors hover:border-zinc-500 hover:text-white"
            >
              CLI docs
            </a>
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-800 px-6 py-8">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 text-sm text-zinc-500 sm:flex-row sm:justify-between">
          <span className="font-black text-zinc-300">
            Token <span className="text-rat-500">Rats</span>
          </span>
          <div className="flex items-center gap-6">
            <a
              href="https://github.com/hsalberti/token-rats"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-zinc-300"
            >
              GitHub
            </a>
            <a
              href="https://github.com/hsalberti/token-rats/blob/main/mission.md"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-zinc-300"
            >
              Mission
            </a>
            <a href="/trending" className="hover:text-zinc-300">
              /trending
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function GitHubIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0 0 22 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}
