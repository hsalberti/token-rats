"use client";

import { useState } from "react";
import { api } from "../../../lib/api";
import type { Leaderboard, LeaderboardRange, Room, RoomMember } from "@token-rats/contracts";
import { Avatar } from "../../../components/ui/Avatar";
import { RankBadge } from "../../../components/ui/RankBadge";
import { Button } from "../../../components/ui/Button";

interface Props {
  room: Room;
  members: RoomMember[];
  initialLeaderboard: Leaderboard;
  cookieHeader: string;
}

const RANGE_LABELS: Record<LeaderboardRange, string> = {
  today: "Today",
  "7d": "7 days",
  "30d": "30 days",
  all: "All time",
};
const RANGES: LeaderboardRange[] = ["today", "7d", "30d", "all"];

function fmtTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return `${n}`;
}

function fmtCost(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function copyText(text: string) {
  navigator.clipboard.writeText(text).catch(() => undefined);
}

export function RoomView({ room, members: _members, initialLeaderboard, cookieHeader }: Props) {
  const [range, setRange] = useState<LeaderboardRange>("today");
  const [leaderboard, setLeaderboard] = useState<Leaderboard>(initialLeaderboard);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<"share" | "invite" | null>(null);

  async function switchRange(r: LeaderboardRange) {
    if (r === range) return;
    setRange(r);
    setLoading(true);
    try {
      const data = await api.getLeaderboard(
        room.code as Parameters<typeof api.getLeaderboard>[0],
        r,
        cookieHeader,
      );
      setLeaderboard(data.leaderboard);
    } catch {
      // keep existing data on error
    } finally {
      setLoading(false);
    }
  }

  function handleShare() {
    copyText(`https://tokenrats.dev/r/${room.code}`);
    setCopied("share");
    setTimeout(() => setCopied(null), 2000);
  }

  function handleInvite() {
    copyText(`https://tokenrats.dev/join/${room.code}`);
    setCopied("invite");
    setTimeout(() => setCopied(null), 2000);
  }

  const totalTokens = leaderboard.rows.reduce((s, r) => s + r.tokens, 0);

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <a href="/app" className="text-sm text-zinc-500 hover:text-zinc-300">
            ← Rooms
          </a>
          <a href="/" className="text-lg font-black tracking-tight">
            Token <span className="text-rat-500">Rats</span>
          </a>
          <div className="w-16" />
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8 space-y-6">
        {/* Room title + actions */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-black tracking-tight">{room.name}</h1>
            <p className="mt-1 font-mono text-sm text-zinc-500">{room.code}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleShare}
            >
              {copied === "share" ? "Copied!" : "Share"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleInvite}
            >
              {copied === "invite" ? "Copied!" : "Invite"}
            </Button>
          </div>
        </div>

        {/* Stat strip */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard label="Members" value={`${leaderboard.rows.length}`} />
          <StatCard label="Total tokens" value={fmtTokens(totalTokens)} />
          <StatCard
            label="Total spent"
            value={fmtCost(leaderboard.rows.reduce((s, r) => s + r.costUsdCents, 0))}
            className="col-span-2 sm:col-span-1"
          />
        </div>

        {/* Range toggle */}
        <div className="flex gap-1 rounded-xl border border-zinc-800 bg-zinc-900 p-1 w-fit">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => switchRange(r)}
              className={[
                "rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
                r === range
                  ? "bg-rat-500 text-white shadow"
                  : "text-zinc-400 hover:text-zinc-200",
              ].join(" ")}
            >
              {RANGE_LABELS[r]}
            </button>
          ))}
        </div>

        {/* Leaderboard */}
        <div className={`transition-opacity duration-150 ${loading ? "opacity-40" : "opacity-100"}`}>
          {leaderboard.rows.length === 0 ? (
            <EmptyLeaderboard />
          ) : (
            <LeaderboardTable rows={leaderboard.rows} />
          )}
        </div>
      </main>
    </div>
  );
}

function StatCard({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className={`rounded-xl border border-zinc-800 bg-zinc-900 p-4 ${className}`}>
      <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-black text-rat-400">{value}</p>
    </div>
  );
}

function EmptyLeaderboard() {
  return (
    <div className="rounded-xl border border-dashed border-zinc-700 px-8 py-16 text-center">
      <p className="text-4xl">🐀</p>
      <p className="mt-3 text-lg font-bold text-zinc-300">No data yet</p>
      <p className="mt-1 text-sm text-zinc-500">
        Invite friends and run{" "}
        <code className="rounded bg-zinc-800 px-1 py-0.5 font-mono text-rat-400">
          npx token-rats sync
        </code>{" "}
        to start.
      </p>
    </div>
  );
}

function LeaderboardTable({ rows }: { rows: Leaderboard["rows"] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
      {/* Desktop header */}
      <div className="hidden grid-cols-[48px_1fr_140px_120px_80px] border-b border-zinc-800 px-4 py-3 text-xs font-semibold uppercase tracking-widest text-zinc-500 sm:grid">
        <span>#</span>
        <span>Developer</span>
        <span className="text-right">Tokens</span>
        <span className="text-right">$ Spent</span>
        <span className="text-right">Sessions</span>
      </div>

      {rows.map((row) => (
        <a
          key={row.userId}
          href={`/u/${row.handle}`}
          className="group flex items-center gap-3 border-b border-zinc-800 px-4 py-4 last:border-0 transition-colors hover:bg-zinc-800/50 sm:grid sm:grid-cols-[48px_1fr_140px_120px_80px]"
        >
          <RankBadge rank={row.rank} />
          <div className="flex items-center gap-3">
            <Avatar src={row.avatarUrl} handle={row.handle} size="sm" />
            <span className="font-semibold group-hover:text-rat-400">
              @{row.handle}
            </span>
          </div>
          {/* Mobile: stacked right side; Desktop: separate columns */}
          <div className="ml-auto flex flex-col items-end gap-0.5 sm:contents">
            <span className="text-right font-mono font-bold text-rat-400">
              {fmtTokens(row.tokens)}
            </span>
            <span className="text-right font-mono text-sm text-zinc-400">
              {fmtCost(row.costUsdCents)}
            </span>
            <span className="hidden text-right font-mono text-sm text-zinc-500 sm:block">
              {row.sessions}
            </span>
          </div>
        </a>
      ))}
    </div>
  );
}
