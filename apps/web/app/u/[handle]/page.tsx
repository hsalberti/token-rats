import type { Metadata } from "next";
import { getCookieHeader, getSession } from "../../../lib/auth";
import { api, ApiError } from "../../../lib/api";
import { Avatar } from "../../../components/ui/Avatar";
import { Card } from "../../../components/ui/Card";
import { PrimarySourcePill, SourceTiles } from "../../../components/SourcePill";
import { ProfileHeatmap } from "../../../components/ProfileHeatmap";
import { TwitterHandlePill } from "../../../components/TwitterHandlePill";
import type { HeatmapResponse } from "@token-rats/contracts";

export const runtime = "edge";

interface Props {
  params: Promise<{ handle: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  const cardUrl = `/cards/u/${handle}`;
  return {
    title: `@${handle}`,
    description: `@${handle}'s Token Rats profile — token burn stats.`,
    openGraph: {
      images: [{ url: cardUrl, width: 1200, height: 630, alt: `Token Rats — @${handle}` }],
    },
    twitter: {
      card: "summary_large_image",
      images: [cardUrl],
    },
  };
}

function fmtTokens(n: number) {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return `${n}`;
}

function fmtCost(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default async function ProfilePage({ params }: Props) {
  const { handle } = await params;
  const cookieHeader = await getCookieHeader();
  const currentUser = await getSession();

  let profile: {
    id: string;
    handle: string;
    avatarUrl: string | null;
    bio?: string | null;
    twitterHandle?: string | null;
    twitterVerified?: boolean;
    publicProfile?: boolean;
    /** v1.2 Track AF — kebab-case primary-source label or null. */
    primarySource?: string | null;
    totals: {
      today: { tokens: number; costUsdCents: number };
      week: { tokens: number; costUsdCents: number };
      allTime: { tokens: number; costUsdCents: number };
    };
    sources?: { source: string; tokens: number; costUsdCents: number; sessions: number }[];
  } | null = null;

  let isPrivate = false;
  let heatmap: HeatmapResponse | null = null;

  try {
    const data = await api.getProfile(handle, cookieHeader);
    profile = data.profile;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      isPrivate = true;
    } else {
      throw err;
    }
  }

  // Heatmap is best-effort: a render error here shouldn't break the profile.
  // v1.2 Track Y — default to 60d; the client toggles to 52w lazily.
  if (!isPrivate) {
    try {
      heatmap = await api.getHeatmap(handle, 60, cookieHeader);
    } catch {
      heatmap = null;
    }
  }

  // Private profile page
  if (isPrivate) {
    return (
      <div className="min-h-screen bg-zinc-950">
        <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur">
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

        <main className="mx-auto max-w-3xl px-6 py-24 flex flex-col items-center text-center space-y-4">
          <span className="text-5xl">🔒</span>
          <h1 className="text-2xl font-black tracking-tight">This profile is private</h1>
          <p className="text-zinc-400 max-w-sm">
            @{handle} hasn&apos;t made their profile public yet. Only they can see their stats.
          </p>
          {!currentUser && (
            <a
              href="/signin"
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-rat-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-rat-600 transition-colors"
            >
              Sign in to view your own profile
            </a>
          )}
        </main>
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur">
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

      <main className="mx-auto max-w-3xl px-6 py-12 space-y-8">
        {/* Profile header */}
        <div className="flex items-center gap-5">
          <Avatar src={profile.avatarUrl} handle={profile.handle} size="xl" />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-black tracking-tight">@{profile.handle}</h1>
              {profile.twitterVerified && <TwitterHandlePill handle={profile.twitterHandle} />}
              <PrimarySourcePill source={profile.primarySource} />
            </div>
            {profile.bio ? (
              <p className="mt-1 text-zinc-300 text-sm leading-relaxed">{profile.bio}</p>
            ) : (
              <p className="mt-1 text-zinc-400">Token Rat</p>
            )}
            {/* Unverified manual handles still get the classic link below the bio,
                so legacy users keep their link until they connect via OAuth. */}
            {profile.twitterHandle && !profile.twitterVerified && (
              <a
                href={`https://twitter.com/${profile.twitterHandle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-rat-400 hover:text-rat-300 transition-colors"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                @{profile.twitterHandle}
              </a>
            )}
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Today"
            tokens={profile.totals.today.tokens}
            cost={profile.totals.today.costUsdCents}
          />
          <StatCard
            label="This week"
            tokens={profile.totals.week.tokens}
            cost={profile.totals.week.costUsdCents}
            highlight
          />
          <StatCard
            label="All time"
            tokens={profile.totals.allTime.tokens}
            cost={profile.totals.allTime.costUsdCents}
          />
        </div>

        {/* Per-source tiles (Track Q in roadmap-providers.md). Shown only
            when the user has actually synced something. */}
        {profile.sources && profile.sources.length > 0 && <SourceTiles sources={profile.sources} />}

        {/* GitHub-style activity heatmap — last 364 days of daily_rollup.
            Best-effort; if the API call errored, `heatmap` is null and we
            skip the block silently. */}
        {heatmap && heatmap.cells.some((c) => c.tokens > 0) && (
          <ProfileHeatmap handle={profile.handle} initialResponse={heatmap} />
        )}

        {/* Badges / tagline */}
        <Card>
          <div className="flex items-center gap-3">
            <span className="text-3xl">🐀</span>
            <div>
              <p className="font-bold">
                {fmtTokens(profile.totals.allTime.tokens)} tokens burned, all time.
              </p>
              <p className="text-sm text-zinc-400">
                That&apos;s {fmtCost(profile.totals.allTime.costUsdCents)} dedicated to the craft.
              </p>
            </div>
          </div>
        </Card>

        {/* Edit profile CTA for the profile owner */}
        {currentUser?.handle === profile.handle && (
          <div className="text-center">
            <a
              href="/settings/profile"
              className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors underline underline-offset-2"
            >
              Edit profile settings
            </a>
          </div>
        )}
      </main>
    </div>
  );
}

function StatCard({
  label,
  tokens,
  cost,
  highlight = false,
}: {
  label: string;
  tokens: number;
  cost: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={[
        "rounded-xl border p-5",
        highlight ? "border-rat-700 bg-rat-900/20" : "border-zinc-800 bg-zinc-900",
      ].join(" ")}
    >
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">{label}</p>
      <p className={`text-3xl font-black ${highlight ? "text-rat-400" : "text-zinc-100"}`}>
        {fmtTokens(tokens)}
      </p>
      <p className="mt-1 font-mono text-sm text-zinc-500">{fmtCost(cost)}</p>
    </div>
  );
}
