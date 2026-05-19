"use client";

/**
 * "Pinned room · 7d" card on the signed-in dashboard.
 *
 * The dashboard passes the user's pinned room (from GET /v1/me/rooms);
 * this component fetches that room's 7d leaderboard, slices the top 5,
 * and appends a highlighted "You · #N" row when the viewer is outside it.
 */

import type { LeaderboardRow, Room } from "@token-rats/contracts";
import { useEffect, useState } from "react";
import { getLeaderboard } from "../lib/api";
import { SourceBadges } from "./SourceBadge";
import { Avatar } from "./ui/Avatar";

interface Props {
  room: Room;
  viewerUserId: string;
}

const TOP_N = 5;

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

export function PinnedRoomPreview({ room, viewerUserId }: Props) {
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRows(null);
    setError(null);
    getLeaderboard(room.code, "7d")
      .then((data) => setRows(data.leaderboard.rows))
      .catch(() => setError("Couldn't load pinned room"));
  }, [room.code]);

  const top = rows?.slice(0, TOP_N) ?? null;
  const viewerInTop = top?.some((r) => r.userId === viewerUserId) ?? false;
  const viewerRow =
    !viewerInTop && rows ? (rows.find((r) => r.userId === viewerUserId) ?? null) : null;

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
      <header className="mb-4 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg font-bold tracking-tight">
            <a href={`/r/${room.code}`} className="hover:text-rat-400 transition-colors">
              <span aria-hidden="true">★ </span>
              {room.name}
              <span className="text-zinc-500"> · 7d</span>
            </a>
          </h2>
          <p className="mt-0.5 font-mono text-xs text-zinc-500">{room.code}</p>
        </div>
        <a
          href={`/r/${room.code}`}
          className="shrink-0 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-700 transition-colors"
        >
          Open →
        </a>
      </header>

      {error ? (
        <p className="text-sm text-red-400">{error}</p>
      ) : rows === null ? (
        <SkeletonRows count={TOP_N} />
      ) : top && top.length === 0 ? (
        <p className="py-6 text-center text-sm text-zinc-500">
          No one in this room has burned tokens in the last 7 days yet.
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
      <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-sm font-semibold text-zinc-100">
        <span className="truncate">
          {isViewer ? "You" : `@${row.handle}`}
          {isViewer && (
            <span className="ml-1.5 text-xs font-normal text-zinc-500">@{row.handle}</span>
          )}
        </span>
        <SourceBadges sources={row.topSources} />
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
