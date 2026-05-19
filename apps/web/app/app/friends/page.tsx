import type { LeaderboardRange } from "@token-rats/contracts";
/**
 * v1.2 Track AD — `/app/friends`
 *
 * Server component. Renders the friends derived from the caller's shared
 * private rooms, with a client-side range toggle and live re-fetch.
 */
import type { Metadata } from "next";
import { Avatar } from "../../../components/ui/Avatar";
import { Wordmark } from "../../../components/ui/Wordmark.js";
import { getMeFriends } from "../../../lib/api";
import { getCookieHeader, requireSession } from "../../../lib/auth";
import { FriendsClient } from "./FriendsClient";

export const runtime = "edge";

export const metadata: Metadata = {
  title: "Friends",
};

const VALID_RANGES = new Set<LeaderboardRange>(["today", "7d", "30d", "all"]);

interface PageProps {
  searchParams: Promise<{ range?: string }>;
}

export default async function FriendsPage({ searchParams }: PageProps) {
  const user = await requireSession();
  const cookieHeader = await getCookieHeader();

  const params = await searchParams;
  const requested = (params.range ?? "7d") as LeaderboardRange;
  const initialRange: LeaderboardRange = VALID_RANGES.has(requested) ? requested : "7d";

  const initial = await getMeFriends(initialRange, cookieHeader).catch(() => ({
    range: initialRange,
    friends: [],
  }));

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <a href="/app">
              <Wordmark size="md" />
            </a>
            <nav className="hidden text-sm text-zinc-400 sm:flex sm:items-center sm:gap-3">
              <span className="text-zinc-600">/</span>
              <a href="/app" className="hover:text-zinc-200">
                Rooms
              </a>
              <span className="text-zinc-600">·</span>
              <a href="/app/friends" className="font-semibold text-zinc-100">
                Friends
              </a>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <Avatar src={user.avatarUrl} handle={user.handle} size="sm" />
            <span className="hidden text-sm font-semibold sm:block">@{user.handle}</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-black tracking-tight">Friends</h1>
          <p className="mt-1 text-zinc-400">
            Everyone you share a private room with. Sorted by spend.
          </p>
        </div>

        <FriendsClient initial={initial} />
      </main>
    </div>
  );
}
