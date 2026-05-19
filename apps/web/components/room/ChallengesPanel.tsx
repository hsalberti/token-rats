"use client";

import type { ChallengeKind, ChallengeWithLeaderboard } from "@token-rats/contracts";
import { useState } from "react";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";

interface ChallengesPanelProps {
  active: ChallengeWithLeaderboard[];
  past: ChallengeWithLeaderboard[];
  loading?: boolean;
  onCreateChallenge: (kind: ChallengeKind, durationDays: number) => Promise<void>;
}

const KIND_LABELS: Record<ChallengeKind, string> = {
  "most-tokens": "Most Tokens",
  "most-sessions": "Most Sessions",
  "longest-streak": "Longest Streak",
};

const KIND_DESCRIPTIONS: Record<ChallengeKind, string> = {
  "most-tokens": "Burn the most tokens in the window",
  "most-sessions": "Run the most synced sessions",
  "longest-streak": "Keep a daily streak the longest",
};

const KINDS: ChallengeKind[] = ["most-tokens", "most-sessions", "longest-streak"];

function fmtScore(kind: ChallengeKind, score: number): string {
  if (kind === "most-tokens") {
    if (score >= 1_000_000_000) return `${(score / 1_000_000_000).toFixed(2)}B tok`;
    if (score >= 1_000_000) return `${(score / 1_000_000).toFixed(1)}M tok`;
    if (score >= 1_000) return `${(score / 1_000).toFixed(0)}K tok`;
    return `${score} tok`;
  }
  if (kind === "most-sessions") return `${score} sessions`;
  return `${score}d streak`;
}

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function ChallengeCard({ challenge }: { challenge: ChallengeWithLeaderboard }) {
  const isPast = challenge.endsAt < Date.now();
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
            {KIND_LABELS[challenge.kind]}
          </span>
          <p className="mt-0.5 text-sm text-zinc-400">
            {fmtDate(challenge.startsAt)} – {fmtDate(challenge.endsAt)}
          </p>
        </div>
        {isPast ? (
          <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-500">Ended</span>
        ) : (
          <span className="rounded bg-rat-900/60 px-2 py-0.5 text-xs font-semibold text-rat-400">
            Active
          </span>
        )}
      </div>

      {isPast && challenge.winnerHandle && (
        <div className="rounded-lg bg-zinc-800/60 px-3 py-2 text-sm">
          <span className="text-zinc-400">Winner: </span>
          <a
            href={`/u/${challenge.winnerHandle}`}
            className="font-bold text-rat-400 hover:underline"
          >
            @{challenge.winnerHandle}
          </a>
          {challenge.rows[0] && (
            <span className="ml-1 text-zinc-500">
              — {fmtScore(challenge.kind, challenge.rows[0].score)}
            </span>
          )}
        </div>
      )}

      {challenge.rows.length > 0 && (
        <div className="space-y-1">
          {challenge.rows.slice(0, 5).map((row) => (
            <div key={row.userId} className="flex items-center gap-2 text-sm">
              <span className="w-4 text-center text-xs font-bold text-zinc-600">{row.rank}</span>
              <Avatar src={row.avatarUrl} handle={row.handle} size="xs" />
              <a
                href={`/u/${row.handle}`}
                className="flex-1 truncate font-medium hover:text-rat-400"
              >
                @{row.handle}
              </a>
              <span className="font-mono text-xs text-zinc-400">
                {fmtScore(challenge.kind, row.score)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ChallengesPanel({
  active,
  past,
  loading = false,
  onCreateChallenge,
}: ChallengesPanelProps) {
  const [creating, setCreating] = useState(false);
  const [selectedKind, setSelectedKind] = useState<ChallengeKind>("most-tokens");
  const [durationDays, setDurationDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setCreateError(null);
    try {
      await onCreateChallenge(selectedKind, durationDays);
      setCreating(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create challenge");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(2)].map((_, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length skeleton list.
            key={i}
            className="h-32 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-zinc-200">Challenges</h3>
        <Button size="sm" onClick={() => setCreating((v) => !v)}>
          {creating ? "Cancel" : "+ New challenge"}
        </Button>
      </div>

      {creating && (
        <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-4 space-y-4">
          <h4 className="font-semibold text-zinc-200">New challenge</h4>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <p className="mb-2 text-sm font-semibold text-zinc-400">Type</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {KINDS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setSelectedKind(k)}
                    className={[
                      "rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                      selectedKind === k
                        ? "border-rat-500 bg-rat-500/10 text-rat-300"
                        : "border-zinc-700 text-zinc-400 hover:border-zinc-500",
                    ].join(" ")}
                  >
                    <p className="font-semibold">{KIND_LABELS[k]}</p>
                    <p className="mt-0.5 text-xs opacity-70">{KIND_DESCRIPTIONS[k]}</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label
                htmlFor="duration"
                className="mb-1.5 block text-sm font-semibold text-zinc-400"
              >
                Duration
              </label>
              <select
                id="duration"
                value={durationDays}
                onChange={(e) => setDurationDays(Number(e.target.value))}
                className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-100 focus:border-rat-500 focus:outline-none"
              >
                <option value={1}>1 day</option>
                <option value={3}>3 days</option>
                <option value={7}>7 days</option>
                <option value={14}>14 days</option>
                <option value={30}>30 days</option>
              </select>
            </div>

            {createError && <p className="text-sm text-red-400">{createError}</p>}

            <Button type="submit" disabled={busy}>
              {busy ? "Creating…" : "Start challenge"}
            </Button>
          </form>
        </div>
      )}

      {active.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold uppercase tracking-widest text-zinc-500">Active</h4>
          {active.map((ch) => (
            <ChallengeCard key={ch.id} challenge={ch} />
          ))}
        </div>
      )}

      {past.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold uppercase tracking-widest text-zinc-500">Past</h4>
          {past.map((ch) => (
            <ChallengeCard key={ch.id} challenge={ch} />
          ))}
        </div>
      )}

      {active.length === 0 && past.length === 0 && !creating && (
        <div className="rounded-xl border border-dashed border-zinc-700 px-8 py-12 text-center">
          <p className="text-3xl">🏆</p>
          <p className="mt-3 font-bold text-zinc-300">No challenges yet</p>
          <p className="mt-1 text-sm text-zinc-500">Start a challenge to compete with your room.</p>
        </div>
      )}
    </div>
  );
}
