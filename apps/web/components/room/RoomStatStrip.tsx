/**
 * RoomStatStrip — v1.2 Track Y. The headline stat block above the leaderboard
 * table on /r/[code]. Fetches the room-summary + group-streak in parallel
 * and renders:
 *
 *  - 🔥 active streak pill (with unanimous count in the title attribute)
 *  - total cost
 *  - active members / day count
 *  - top contributor share
 *  - model mix pills (top 3)
 *  - source mix pills (top 3)
 *
 * The strip re-fetches whenever the parent's range changes (single source of
 * truth from RoomView).
 */
"use client";

import { useEffect, useState } from "react";
import type {
  GroupStreak,
  LeaderboardRange,
  RoomSummary,
} from "@token-rats/contracts";
import { api } from "../../lib/api";

interface Props {
  code: string;
  range: LeaderboardRange;
}

function fmtCost(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function RoomStatStrip({ code, range }: Props) {
  const [summary, setSummary] = useState<RoomSummary | null>(null);
  const [streak, setStreak] = useState<GroupStreak | null>(null);
  const [loading, setLoading] = useState(true);

  // Group streak doesn't depend on range, but the summary does.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .getRoomSummary(code, range)
      .then((data) => {
        if (!cancelled) setSummary(data.summary);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [code, range]);

  useEffect(() => {
    let cancelled = false;
    api
      .getRoomGroupStreak(code)
      .then((data) => {
        if (!cancelled) setStreak(data.streak);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [code]);

  // While loading, render a skeleton so the layout doesn't jump.
  if (!summary && loading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900"
          />
        ))}
      </div>
    );
  }

  if (!summary) return null;

  return (
    <div className="space-y-3">
      {/* Streak pill row */}
      {streak && streak.activeStreakDays > 0 && (
        <div className="flex">
          <span
            title={`${streak.unanimousActiveStreakDays}d unanimous · ${streak.longestStreakDays}d longest active · ${streak.unanimousLongestStreakDays}d longest unanimous`}
            className="inline-flex items-center gap-1.5 rounded-full border border-rat-500/40 bg-rat-500/10 px-3 py-1 text-sm font-semibold text-rat-400"
          >
            <span aria-hidden>🔥</span>
            {streak.activeStreakDays}d group streak
          </span>
        </div>
      )}

      {/* Stat grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total spent" value={fmtCost(summary.totalCostUsdCents)} />
        <StatCard
          label="Active members"
          value={`${summary.activeMembers} · ${summary.dayCount}d`}
          hint="members active · distinct active days"
        />
        <StatCard
          label="Top contributor"
          value={`${summary.topContributorSharePct.toFixed(1)}%`}
          hint="share of the room's spend"
        />
        <StatCard
          label="Active streak"
          value={streak ? `${streak.activeStreakDays}d` : "—"}
          hint={
            streak
              ? `${streak.unanimousActiveStreakDays}d unanimous`
              : undefined
          }
        />
      </div>

      {/* Mix pill rows */}
      {(summary.modelMix.length > 0 || summary.sourceMix.length > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          {summary.modelMix.length > 0 && (
            <PillRow label="Models">
              {summary.modelMix.map((m) => (
                <Pill key={m.model} label={m.model} share={m.sharePct} />
              ))}
            </PillRow>
          )}
          {summary.sourceMix.length > 0 && (
            <PillRow label="Sources">
              {summary.sourceMix.map((s) => (
                <Pill key={s.source} label={s.source} share={s.sharePct} />
              ))}
            </PillRow>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4" title={hint}>
      <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-black text-rat-400">{value}</p>
    </div>
  );
}

function PillRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Pill({ label, share }: { label: string; share: number }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-800/60 px-2.5 py-0.5 text-xs font-medium text-zinc-300"
      title={`${share.toFixed(1)}% of room spend`}
    >
      <span>{label}</span>
      <span className="font-mono text-zinc-500">{share.toFixed(0)}%</span>
    </span>
  );
}
