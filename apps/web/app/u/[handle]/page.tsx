import type { Heatmap, HeatmapRange } from "@token-rats/contracts";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { ProfileHeatmapClient } from "../../../components/ProfileHeatmapClient";
import { ProfileReferralCard } from "../../../components/ProfileReferralCard";
import { SourceTiles } from "../../../components/SourcePill";
import { TwitterHandlePill } from "../../../components/TwitterHandlePill";
import { Avatar } from "../../../components/ui/Avatar";
import { Card } from "../../../components/ui/Card";
import { Wordmark } from "../../../components/ui/Wordmark.js";
import { ApiError, api } from "../../../lib/api";
import { getCookieHeader, getSession } from "../../../lib/auth";

export const runtime = "edge";

interface Props {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ range?: string | string[] }>;
}

function pickRange(raw: string | string[] | undefined): HeatmapRange {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === "52w" ? "52w" : "30d";
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

export default async function ProfilePage({ params, searchParams }: Props) {
  const { handle } = await params;
  const range = pickRange((await searchParams).range);
  const cookieHeader = await getCookieHeader();
  const currentUser = await getSession();

  let profile: {
    id: string;
    handle: string;
    avatarUrl: string | null;
    bio?: string | null;
    twitterHandle?: string | null;
    publicProfile?: boolean;
    referredCount?: number;
    referralCode?: string;
    totals: {
      today: { tokens: number; costUsdCents: number };
      week: { tokens: number; costUsdCents: number };
      allTime: { tokens: number; costUsdCents: number };
    };
    sources?: { source: string; tokens: number; costUsdCents: number; sessions: number }[];
  } | null = null;

  let isPrivate = false;
  let heatmap: Heatmap | null = null;

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
  if (!isPrivate) {
    try {
      const data = await api.getHeatmap(handle, range, cookieHeader);
      heatmap = data.heatmap;
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
            <a href="/">
              <Wordmark size="md" />
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

  // Origin for the share link — read from request headers so SSR and CSR
  // render identically (no client-only window reads).
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const origin = host ? `${proto}://${host}` : "https://tokenrats.com";

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <a href="/" className="text-sm text-zinc-500 hover:text-zinc-300">
            &larr; Home
          </a>
          <a href="/">
            <Wordmark size="md" />
          </a>
          <div className="w-16" />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12 space-y-8">
        {/* Profile header */}
        <div className="flex items-center gap-5">
          <Avatar src={profile.avatarUrl} handle={profile.handle} size="xl" />
          <div className="flex-1 min-w-0">
            <h1 className="text-3xl font-black tracking-tight">@{profile.handle}</h1>
            {profile.bio ? (
              <p className="mt-1 text-zinc-300 text-sm leading-relaxed">{profile.bio}</p>
            ) : (
              <p className="mt-1 text-zinc-400">Token Rat</p>
            )}
            {profile.twitterHandle && (
              <div className="mt-2">
                <TwitterHandlePill handle={profile.twitterHandle} />
              </div>
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

        {/* Activity heatmap with a 30d/52w toggle. Default is 30d. Best-effort;
            if the API call errored, `heatmap` is null and we skip the block. */}
        {heatmap && heatmap.days.length > 0 && (
          <ProfileHeatmapClient handle={handle} initial={heatmap} />
        )}

        {/* Referrals — count is public on any visible profile; the
            copy-able invite link is only included when the viewer owns
            the profile (API enforces this by only sending referralCode
            to the owner). */}
        {(typeof profile.referredCount === "number" || profile.referralCode) && (
          <ProfileReferralCard
            count={profile.referredCount ?? 0}
            referralCode={profile.referralCode}
            origin={origin}
            handle={profile.handle}
          />
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
