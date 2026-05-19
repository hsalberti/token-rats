"use client";

/**
 * TrendingClient — handles the range toggle and re-fetches data client-side
 * when the user switches ranges.
 */

import { Avatar } from "@/components/ui/Avatar";
import { getTrending } from "@/lib/api";
import { useState, useTransition } from "react";

type Range = "today" | "7d" | "30d";

interface TrendingRow {
  rank: number;
  userId: string;
  handle: string;
  avatarUrl: string | null;
  tokens: number;
  costUsdCents: number;
  sessions: number;
}

interface Props {
  initialRows: TrendingRow[];
  initialRange: Range;
  generatedAt: number;
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

const RANGE_LABELS: Record<Range, string> = {
  today: "Today",
  "7d": "7 days",
  "30d": "30 days",
};

export function TrendingClient({ initialRows, initialRange, generatedAt }: Props) {
  const [range, setRange] = useState<Range>(initialRange);
  const [rows, setRows] = useState<TrendingRow[]>(initialRows);
  const [ts, setTs] = useState(generatedAt);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function switchRange(next: Range) {
    if (next === range) return;
    setRange(next);
    setError(null);

    // Keep ?range= in sync via shallow nav. Default (7d on /, today on /trending)
    // gets a bare URL — strip the param when matching the page default.
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      const pageDefault: Range = url.pathname === "/" ? "7d" : "today";
      if (next === pageDefault) {
        url.searchParams.delete("range");
      } else {
        url.searchParams.set("range", next);
      }
      window.history.replaceState(null, "", url.toString());
    }

    startTransition(async () => {
      try {
        const data = await getTrending(next);
        setRows(data.rows);
        setTs(data.generatedAt);
      } catch {
        setError("Failed to load trending data. Please try again.");
      }
    });
  }

  const generatedDate = new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="space-y-6">
      {/* Range toggle */}
      <div className="flex items-center gap-2">
        {(["today", "7d", "30d"] as Range[]).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => switchRange(r)}
            disabled={isPending}
            className={[
              "rounded-lg px-4 py-2 text-sm font-semibold transition-colors duration-150",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              range === r ? "bg-rat-500 text-white" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700",
            ].join(" ")}
          >
            {RANGE_LABELS[r]}
          </button>
        ))}
        <span className="ml-auto text-xs text-zinc-600">Updated {generatedDate}</span>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {/* Leaderboard */}
      {rows.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-12 text-center">
          <p className="text-zinc-500">No public users on the leaderboard yet.</p>
          <p className="text-sm text-zinc-600 mt-1">
            Make your profile public in{" "}
            <a href="/settings/profile" className="text-rat-400 hover:text-rat-300 underline">
              profile settings
            </a>{" "}
            to appear here.
          </p>
        </div>
      ) : (
        <ol className="space-y-2">
          {rows.map((row) => (
            <li key={row.userId}>
              <a
                href={`/u/${row.handle}`}
                className={[
                  "flex items-center gap-4 rounded-xl border px-4 py-3",
                  "transition-colors duration-150 hover:border-zinc-700",
                  row.rank <= 3
                    ? "border-rat-800/60 bg-rat-900/10"
                    : "border-zinc-800 bg-zinc-900/50",
                ].join(" ")}
              >
                {/* Rank */}
                <span
                  className={[
                    "w-8 text-center font-black text-lg shrink-0",
                    row.rank === 1
                      ? "text-amber-400"
                      : row.rank === 2
                        ? "text-zinc-300"
                        : row.rank === 3
                          ? "text-amber-700"
                          : "text-zinc-600",
                  ].join(" ")}
                >
                  {row.rank <= 3 ? ["🥇", "🥈", "🥉"][row.rank - 1] : `#${row.rank}`}
                </span>

                {/* Avatar */}
                <Avatar src={row.avatarUrl} handle={row.handle} size="sm" />

                {/* Handle */}
                <span className="flex-1 font-semibold text-zinc-100 truncate min-w-0">
                  @{row.handle}
                </span>

                {/* Stats */}
                <div className="text-right shrink-0">
                  <p className="font-black text-zinc-100">{fmtTokens(row.tokens)}</p>
                  <p className="text-xs text-zinc-500 font-mono">{fmtCost(row.costUsdCents)}</p>
                </div>
              </a>
            </li>
          ))}
        </ol>
      )}

      {rows.length > 0 && (
        <p className="text-center text-xs text-zinc-600">
          Showing {rows.length} public users &middot; Top 100 &middot; Updated every 5 minutes
        </p>
      )}
    </div>
  );
}
