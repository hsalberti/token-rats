"use client";

/**
 * v1.2 Track AD — friends list client component.
 *
 * Renders the range toggle + the row list, re-fetching when the range flips.
 */

import { useState, useTransition } from "react";
import { Avatar } from "../../../components/ui/Avatar";
import { getMeFriends } from "../../../lib/api";
import type { FriendRow, FriendsResponse, LeaderboardRange } from "@token-rats/contracts";

interface Props {
  initial: FriendsResponse;
}

const RANGES: LeaderboardRange[] = ["today", "7d", "30d", "all"];
const RANGE_LABELS: Record<LeaderboardRange, string> = {
  today: "Today",
  "7d": "7 days",
  "30d": "30 days",
  all: "All time",
};

function fmtTokens(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return `${n}`;
}

function fmtCost(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function FriendsClient({ initial }: Props) {
  const [range, setRange] = useState<LeaderboardRange>(initial.range);
  const [friends, setFriends] = useState<FriendRow[]>(initial.friends);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function switchRange(next: LeaderboardRange) {
    if (next === range) return;
    setRange(next);
    setError(null);
    startTransition(async () => {
      try {
        const data = await getMeFriends(next);
        setFriends(data.friends);
      } catch {
        setError("Failed to load friends. Please try again.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => switchRange(r)}
            disabled={isPending}
            className={[
              "rounded-lg px-4 py-2 text-sm font-semibold transition-colors duration-150",
              "disabled:cursor-not-allowed disabled:opacity-50",
              range === r ? "bg-rat-500 text-white" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700",
            ].join(" ")}
          >
            {RANGE_LABELS[r]}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {friends.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="divide-y divide-zinc-800 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
          {friends.map((f) => (
            <FriendRowItem key={f.userId} friend={f} fade={isPending} />
          ))}
        </ul>
      )}
    </div>
  );
}

function FriendRowItem({ friend, fade }: { friend: FriendRow; fade: boolean }) {
  const profileHref = friend.publicProfile ? `/u/${friend.handle}` : undefined;
  const HeadingTag = profileHref ? "a" : "div";

  return (
    <li
      className={[
        "flex flex-col gap-3 px-4 py-4 transition-opacity sm:flex-row sm:items-center sm:gap-4",
        fade ? "opacity-50" : "opacity-100",
      ].join(" ")}
    >
      <HeadingTag
        {...(profileHref ? { href: profileHref } : {})}
        className={[
          "flex min-w-0 flex-1 items-center gap-3",
          profileHref ? "group hover:text-rat-400" : "",
        ].join(" ")}
      >
        <Avatar src={friend.avatarUrl} handle={friend.handle} size="md" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-bold">@{friend.handle}</span>
            {friend.twitterHandle ? (
              <a
                href={`https://x.com/${friend.twitterHandle}`}
                target="_blank"
                rel="noreferrer noopener"
                onClick={(e) => e.stopPropagation()}
                className="rounded-md bg-zinc-800 px-1.5 py-0.5 font-mono text-[11px] text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
              >
                𝕏 @{friend.twitterHandle}
              </a>
            ) : null}
          </div>
          <div className="mt-0.5 truncate text-xs text-zinc-500">
            <SharedRoomsSummary rooms={friend.sharedRooms} />
          </div>
        </div>
      </HeadingTag>

      <div className="flex shrink-0 items-center gap-5 sm:gap-6">
        <Stat label="tokens" value={fmtTokens(friend.tokens)} />
        <Stat label="spend" value={fmtCost(friend.costUsdCents)} mono />
        <Stat label="sessions" value={`${friend.sessions}`} />
      </div>
    </li>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="text-right">
      <div className={["text-sm font-semibold text-zinc-200", mono ? "font-mono" : ""].join(" ")}>
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-zinc-600">{label}</div>
    </div>
  );
}

function SharedRoomsSummary({ rooms }: { rooms: FriendRow["sharedRooms"] }) {
  if (rooms.length === 0) return <span>Shared private room</span>;
  if (rooms.length <= 2) {
    return (
      <span>
        in{" "}
        {rooms.map((r, i) => (
          <span key={r.code}>
            <a href={`/r/${r.code}`} className="text-zinc-400 hover:text-rat-400">
              #{r.name}
            </a>
            {i < rooms.length - 1 ? ", " : ""}
          </span>
        ))}
      </span>
    );
  }
  return <span>{rooms.length} shared rooms</span>;
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-zinc-700 px-8 py-16 text-center">
      <p className="text-4xl">🐀</p>
      <p className="mt-3 text-lg font-bold text-zinc-300">No friends yet</p>
      <p className="mt-1 text-sm text-zinc-500">
        You&apos;re not in any shared rooms yet. Join or create one to see your crew here.
      </p>
      <a
        href="/app"
        className="mt-4 inline-block rounded-lg bg-rat-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rat-600"
      >
        Go to your rooms
      </a>
    </div>
  );
}
