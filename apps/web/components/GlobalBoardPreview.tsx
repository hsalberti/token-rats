"use client";

/**
 * Compact "Global leaderboard · 7d" card on the signed-in dashboard.
 *
 * Reuses GET /v1/trending, slices top 10, and appends a highlighted
 * "You · #N" row when the viewer is public AND outside top 10. The full
 * top-100 board lives on /trending (un-redirected for signed-in users).
 */

import type { LeaderboardRow } from "@token-rats/contracts";
import { useEffect, useState } from "react";
import { getTrending } from "../lib/api";
import { Avatar } from "./ui/Avatar";

interface Props {
  viewerUserId: string;
  viewerPublicProfile: boolean;
}

const TOP_N = 10;

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

export function GlobalBoardPreview({ viewerUserId, viewerPublicProfile }: Props) {
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTrending("7d")
      .then((data) => setRows(data.rows))
      .catch(() => setError("Couldn't load global board"));
  }, []);

  const top = rows?.slice(0, TOP_N) ?? null;
  const viewerInTop = top?.some((r) => r.userId === viewerUserId) ?? false;
  const viewerRow =
    !viewerInTop && viewerPublicProfile
      ? (rows?.find((r) => r.userId === viewerUserId) ?? null)
      : null;

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
      <header className="mb-4 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold tracking-tight">
            <a href="/trending?range=7d" className="hover:text-rat-400 transition-colors">
              Global leaderboard <span className="text-zinc-500">· 7d</span>
            </a>
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Live ranking of public Token Rats. Top 10 shown.
          </p>
        </div>
        <a
          href="/trending?range=7d"
          className="shrink-0 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-700 transition-colors"
        >
          View all →
        </a>
      </header>

      {error ? (
        <p className="text-sm text-red-400">{error}</p>
      ) : rows === null ? (
        <SkeletonRows count={TOP_N} />
      ) : top && top.length === 0 ? (
        <p className="py-6 text-center text-sm text-zinc-500">
          No public users on the board yet. Be the first by going public in{" "}
          <a href="/settings/profile" className="text-rat-400 hover:text-rat-300 underline">
            profile settings
          </a>
          .
        </p>
      ) : (
        <ol className="space-y-1.5">
          {top?.map((row) => (
            <PreviewRow key={row.userId} row={row} isViewer={row.userId === viewerUserId} />
          ))}
          {viewerRow && (
            <li className="pt-2 border-t border-zinc-800">
              <PreviewRow row={viewerRow} isViewer />
            </li>
          )}
        </ol>
      )}

      {!error && rows !== null && !viewerPublicProfile && (
        <p className="mt-4 text-xs text-zinc-500">
          <a href="/settings/profile" className="text-rat-400 hover:text-rat-300 underline">
            Go public
          </a>{" "}
          to appear on the global board.
        </p>
      )}
    </section>
  );
}

function PreviewRow({ row, isViewer }: { row: LeaderboardRow; isViewer: boolean }) {
  return (
    <a
      href={`/u/${row.handle}`}
      className={[
        "flex items-center gap-3 rounded-lg px-3 py-2 transition-colors",
        isViewer ? "bg-rat-900/30 ring-1 ring-rat-800/60" : "hover:bg-zinc-800/60",
      ].join(" ")}
    >
      <span
        className={[
          "w-7 shrink-0 text-center font-black text-sm",
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
      <Avatar src={row.avatarUrl} handle={row.handle} size="xs" />
      <span className="flex-1 truncate min-w-0 text-sm font-semibold text-zinc-100">
        {isViewer ? "You" : `@${row.handle}`}
        {isViewer && (
          <span className="ml-1.5 text-xs font-normal text-zinc-500">@{row.handle}</span>
        )}
      </span>
      <div className="shrink-0 text-right">
        <p className="text-sm font-bold text-zinc-100">{fmtTokens(row.tokens)}</p>
        <p className="font-mono text-[10px] text-zinc-500">{fmtCost(row.costUsdCents)}</p>
      </div>
    </a>
  );
}

function SkeletonRows({ count }: { count: number }) {
  return (
    <ol className="space-y-1.5">
      {[...Array(count)].map((_, i) => (
        <li
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length skeleton.
          key={i}
          className="flex items-center gap-3 rounded-lg px-3 py-2"
        >
          <div className="h-4 w-7 rounded bg-zinc-800/80 animate-pulse" />
          <div className="h-6 w-6 rounded-full bg-zinc-800/80 animate-pulse" />
          <div className="h-4 flex-1 rounded bg-zinc-800/80 animate-pulse" />
          <div className="h-4 w-12 rounded bg-zinc-800/80 animate-pulse" />
        </li>
      ))}
    </ol>
  );
}
