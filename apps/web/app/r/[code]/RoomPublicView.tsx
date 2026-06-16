/**
 * RoomPublicView — what signed-out viewers (and signed-in non-members on a
 * private room they can't join) see at /r/[code]. Renders just the public
 * stat strip plus a sign-in / join CTA. No leaderboard, no heatmap, no
 * group streak.
 *
 * Server component — pure read of `summary`.
 */

import type { RoomSummary } from "@token-rats/contracts";

interface Props {
  summary: RoomSummary;
  signedIn: boolean;
  /**
   * Viewer's resolved country (cf-ipcountry). When set and the room is
   * public + country-mismatched, we replace the CTA with a country pill.
   */
  viewerCountry?: string | null;
}

function flagFor(cc: string): string {
  return cc
    .toUpperCase()
    .split("")
    .map((c) => String.fromCodePoint(127397 + c.charCodeAt(0)))
    .join("");
}

function countryLabel(cc: string): string {
  try {
    const names = new Intl.DisplayNames(["en"], { type: "region" });
    return names.of(cc) ?? cc;
  } catch {
    return cc;
  }
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

export function RoomPublicView({ summary, signedIn, viewerCountry }: Props) {
  const signInHref = signedIn ? "/app" : `/signin?next=/r/${encodeURIComponent(summary.code)}`;
  const ctaLabel = signedIn ? "Open dashboard" : "Sign in to join";
  // Country-mismatch state — public room whose country doesn't match the viewer.
  const isCountryMismatch =
    summary.isPublic && !!summary.country && !!viewerCountry && summary.country !== viewerCountry;

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <a href="/" className="text-sm text-zinc-500 hover:text-zinc-300">
            &larr; Home
          </a>
          <a href="/" className="text-lg font-black tracking-tight">
            Token <span className="text-rat-500">Rats</span>
          </a>
          <div className="w-16" />
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-12 space-y-8">
        <div>
          <h1 className="text-3xl font-black tracking-tight">{summary.name}</h1>
          <p className="mt-1 font-mono text-sm text-zinc-500">{summary.code}</p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard label="Members" value={`${summary.memberCount}`} />
          <StatCard label="30d tokens" value={fmtTokens(summary.total30dTokens)} primary />
          <StatCard
            label="30d spent"
            value={fmtCost(summary.total30dCostUsdCents)}
            className="col-span-2 sm:col-span-1"
          />
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-zinc-200">
              {isCountryMismatch
                ? "This is a country-locked room."
                : signedIn
                  ? "You're not a member of this room yet."
                  : "Join the room to see the leaderboard."}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              {isCountryMismatch
                ? "Public rooms are joinable only by viewers Cloudflare resolves to the room's country."
                : "Members see the live leaderboard, streaks, and a member activity heatmap (account-wide)."}
            </p>
          </div>
          {isCountryMismatch && summary.country ? (
            <span
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-300"
              title={`Lock: ${countryLabel(summary.country)}`}
            >
              For viewers in {flagFor(summary.country)} {countryLabel(summary.country)}
            </span>
          ) : (
            <a
              href={signInHref}
              className="inline-flex items-center justify-center rounded-lg bg-rat-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rat-600 active:bg-rat-700"
            >
              {ctaLabel}
            </a>
          )}
        </div>
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  primary = false,
  className = "",
}: {
  label: string;
  value: string;
  primary?: boolean;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-zinc-800 bg-zinc-900 p-4 ${className}`}>
      <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">{label}</p>
      <p className={`mt-1 text-2xl font-black ${primary ? "text-rat-400" : "text-zinc-100"}`}>
        {value}
      </p>
    </div>
  );
}
