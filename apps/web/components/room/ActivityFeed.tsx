"use client";

import type { ActivityRow } from "@token-rats/contracts";
import { Avatar } from "../ui/Avatar";

interface ActivityFeedProps {
  activity: ActivityRow[];
  loading?: boolean;
}

function fmtTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return `${n}`;
}

function fmtCost(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
}

export function ActivityFeed({ activity, loading = false }: ActivityFeedProps) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900" />
        ))}
      </div>
    );
  }

  if (activity.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-700 px-8 py-12 text-center">
        <p className="text-3xl">📭</p>
        <p className="mt-3 font-bold text-zinc-300">No activity yet</p>
        <p className="mt-1 text-sm text-zinc-500">
          Run{" "}
          <code className="rounded bg-zinc-800 px-1 py-0.5 font-mono text-rat-400">
            npx token-rats sync
          </code>{" "}
          to start.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
      {activity.map((row, i) => (
        <div
          key={row.sessionId}
          className={[
            "flex items-center gap-3 px-4 py-3",
            i !== activity.length - 1 ? "border-b border-zinc-800" : "",
          ].join(" ")}
        >
          <Avatar src={row.avatarUrl} handle={row.handle} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-1.5">
              <a href={`/u/${row.handle}`} className="font-semibold hover:text-rat-400 truncate">
                @{row.handle}
              </a>
              <span className="text-xs text-zinc-500 shrink-0">{timeAgo(row.at)}</span>
            </div>
            <p className="text-xs text-zinc-500 truncate font-mono">{row.model}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="font-mono font-bold text-rat-400 text-sm">{fmtTokens(row.tokens)}</p>
            <p className="font-mono text-xs text-zinc-500">{fmtCost(row.costUsdCents)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
