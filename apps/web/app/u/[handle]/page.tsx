import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCookieHeader } from "../../../lib/auth";
import { api, ApiError } from "../../../lib/api";
import { Avatar } from "../../../components/ui/Avatar";
import { Card } from "../../../components/ui/Card";

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
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return `${n}`;
}

function fmtCost(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default async function ProfilePage({ params }: Props) {
  const { handle } = await params;
  const cookieHeader = await getCookieHeader();

  let profile;
  try {
    const data = await api.getProfile(handle, cookieHeader);
    profile = data.profile;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <a href="/" className="text-sm text-zinc-500 hover:text-zinc-300">
            ← Home
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
          <div>
            <h1 className="text-3xl font-black tracking-tight">@{profile.handle}</h1>
            <p className="mt-1 text-zinc-400">Token Rat</p>
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
