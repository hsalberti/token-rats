"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../../../lib/api";
import type {
  ActivityRow,
  ChallengeKind,
  ChallengeWithLeaderboard,
  Leaderboard,
  LeaderboardRange,
  LiveEvent,
  Room,
  RoomCode,
  RoomMember,
  StreakRow,
} from "@token-rats/contracts";
import { useRoomLive } from "../../../lib/use-room-live";
import { Avatar } from "../../../components/ui/Avatar";
import { RankBadge } from "../../../components/ui/RankBadge";
import { Button } from "../../../components/ui/Button";
import { SourceBadges } from "../../../components/SourceBadge";
import { StreakBadge } from "../../../components/room/StreakBadge";
import { ActivityFeed } from "../../../components/room/ActivityFeed";
import { ChallengesPanel } from "../../../components/room/ChallengesPanel";
import { RenameRoomForm } from "../../../components/room/RenameRoomForm";
import { RoomStatStrip } from "../../../components/room/RoomStatStrip";
import { RoomHeatmap } from "../../../components/room/RoomHeatmap";

interface Props {
  room: Room;
  members: RoomMember[];
  initialLeaderboard: Leaderboard;
  cookieHeader: string;
  currentUserId?: string;
}

type Tab = "leaderboard" | "activity" | "challenges";

const RANGE_LABELS: Record<LeaderboardRange, string> = {
  today: "Today",
  "7d": "7 days",
  "30d": "30 days",
  all: "All time",
};
const RANGES: LeaderboardRange[] = ["today", "7d", "30d", "all"];

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

function copyText(text: string) {
  navigator.clipboard.writeText(text).catch(() => undefined);
}

export function RoomView({
  room: initialRoom,
  members: _members,
  initialLeaderboard,
  cookieHeader,
  currentUserId,
}: Props) {
  const [room, setRoom] = useState<Room>(initialRoom);
  const [activeTab, setActiveTab] = useState<Tab>("leaderboard");
  const [range, setRange] = useState<LeaderboardRange>("today");
  const [leaderboard, setLeaderboard] = useState<Leaderboard>(initialLeaderboard);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [renamingRoom, setRenamingRoom] = useState(false);

  // Activity tab state
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityLoaded, setActivityLoaded] = useState(false);

  // Streaks state (loaded alongside leaderboard)
  const [streaks, setStreaks] = useState<StreakRow[]>([]);
  const [streaksLoaded, setStreaksLoaded] = useState(false);

  // Challenges tab state
  const [activeChallenges, setActiveChallenges] = useState<ChallengeWithLeaderboard[]>([]);
  const [pastChallenges, setPastChallenges] = useState<ChallengeWithLeaderboard[]>([]);
  const [challengesLoading, setChallengesLoading] = useState(false);
  const [challengesLoaded, setChallengesLoaded] = useState(false);

  // Live toast state — "new burn from @handle"
  const [liveToast, setLiveToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isOwner = currentUserId === room.ownerId;

  // Keep a stable ref to the current range so the SSE handler can read it
  // without creating a new closure / re-subscribing.
  const rangeRef = useRef<LeaderboardRange>(range);
  useEffect(() => {
    rangeRef.current = range;
  }, [range]);

  // SSE — live leaderboard + session-added toasts
  const handleLiveEvent = useCallback(
    (event: LiveEvent) => {
      if (event.kind === "leaderboard-update") {
        // Refetch the leaderboard in the currently-selected range
        api
          .getLeaderboard(room.code as RoomCode, rangeRef.current, cookieHeader)
          .then((data) => setLeaderboard(data.leaderboard))
          .catch(() => undefined);
      } else if (event.kind === "session-added") {
        const msg = `new burn from @${event.payload.handle}`;
        setLiveToast(msg);
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => setLiveToast(null), 4000);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [room.code, cookieHeader],
  );

  useRoomLive(room.code as RoomCode, handleLiveEvent);

  // Load streaks once on mount
  useEffect(() => {
    if (streaksLoaded) return;
    api
      .getRoomStreaks(room.code as Parameters<typeof api.getRoomStreaks>[0], cookieHeader)
      .then((data) => {
        setStreaks(data.streaks);
        setStreaksLoaded(true);
      })
      .catch(() => {
        // streaks are bonus data — silently ignore
        setStreaksLoaded(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function switchRange(r: LeaderboardRange) {
    if (r === range) return;
    setRange(r);
    setLeaderboardLoading(true);
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
      setLeaderboardLoading(false);
    }
  }

  function handleSwitchTab(tab: Tab) {
    setActiveTab(tab);

    if (tab === "activity" && !activityLoaded) {
      setActivityLoading(true);
      api
        .getRoomActivity(room.code as Parameters<typeof api.getRoomActivity>[0], 20, cookieHeader)
        .then((data) => {
          setActivity(data.activity);
          setActivityLoaded(true);
        })
        .catch(() => {
          setActivityLoaded(true);
        })
        .finally(() => setActivityLoading(false));
    }

    if (tab === "challenges" && !challengesLoaded) {
      setChallengesLoading(true);
      api
        .getRoomChallenges(room.code as Parameters<typeof api.getRoomChallenges>[0], cookieHeader)
        .then((data) => {
          setActiveChallenges(data.active);
          setPastChallenges(data.past);
          setChallengesLoaded(true);
        })
        .catch(() => {
          setChallengesLoaded(true);
        })
        .finally(() => setChallengesLoading(false));
    }
  }

  async function handleCreateChallenge(kind: ChallengeKind, durationDays: number) {
    await api.createChallenge(
      room.code as Parameters<typeof api.createChallenge>[0],
      { kind, durationDays },
      cookieHeader,
    );
    // Refresh challenges list
    const data = await api.getRoomChallenges(
      room.code as Parameters<typeof api.getRoomChallenges>[0],
      cookieHeader,
    );
    setActiveChallenges(data.active);
    setPastChallenges(data.past);
  }

  async function handleRename(name: string) {
    const data = await api.renameRoom(
      room.code as Parameters<typeof api.renameRoom>[0],
      { name },
      cookieHeader,
    );
    setRoom(data.room);
  }

  function handleInvite() {
    copyText(`https://tokenrats.com/join/${room.code}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Build streak lookup by userId for leaderboard augmentation
  const streakByUser = new Map(streaks.map((s) => [s.userId, s]));

  // Show a "you're in, now run the CLI" hint if the current viewer is a member
  // but has no sessions for the selected range yet.
  const viewerRow = currentUserId
    ? leaderboard.rows.find((r) => r.userId === currentUserId)
    : undefined;
  const viewerNeedsSync = viewerRow !== undefined && viewerRow.sessions === 0;

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <a href="/app" className="text-sm text-zinc-500 hover:text-zinc-300">
            Rooms
          </a>
          <a href="/" className="text-lg font-black tracking-tight">
            Token <span className="text-rat-500">Rats</span>
          </a>
          <div className="w-16" />
        </div>
      </header>

      {/* Live toast */}
      {liveToast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-rat-500/40 bg-zinc-900 px-5 py-3 text-sm font-semibold text-rat-400 shadow-lg transition-all">
          {liveToast}
        </div>
      )}

      <main className="mx-auto max-w-4xl px-6 py-8 space-y-6">
        {/* Room title + actions */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            {renamingRoom ? (
              <RenameRoomForm
                currentName={room.name}
                onRename={handleRename}
                onClose={() => setRenamingRoom(false)}
              />
            ) : (
              <div className="flex items-center gap-2">
                <h1 className="text-3xl font-black tracking-tight">{room.name}</h1>
                {isOwner && (
                  <button
                    onClick={() => setRenamingRoom(true)}
                    title="Rename room"
                    aria-label="Rename room"
                    className="rounded-lg p-1.5 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300 transition-colors"
                  >
                    {/* Gear / settings cog icon */}
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="h-5 w-5"
                    >
                      <path
                        fillRule="evenodd"
                        d="M7.84 1.804A1 1 0 018.82 1h2.36a1 1 0 01.98.804l.331 1.652a6.993 6.993 0 011.929 1.115l1.598-.54a1 1 0 011.186.447l1.18 2.044a1 1 0 01-.205 1.251l-1.267 1.113a7.047 7.047 0 010 2.228l1.267 1.113a1 1 0 01.206 1.25l-1.18 2.045a1 1 0 01-1.187.447l-1.598-.54a6.993 6.993 0 01-1.929 1.115l-.33 1.652a1 1 0 01-.98.804H8.82a1 1 0 01-.98-.804l-.331-1.652a6.993 6.993 0 01-1.929-1.115l-1.598.54a1 1 0 01-1.186-.447l-1.18-2.044a1 1 0 01.205-1.251l1.267-1.114a7.05 7.05 0 010-2.227L1.821 7.773a1 1 0 01-.206-1.25L2.795 4.48a1 1 0 011.187-.447l1.598.54A6.993 6.993 0 017.51 3.456l.33-1.652zM10 13a3 3 0 100-6 3 3 0 000 6z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                )}
              </div>
            )}
            <p className="mt-1 font-mono text-sm text-zinc-500">{room.code}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={handleInvite}>
              {copied ? "Copied!" : "Copy invite link"}
            </Button>
          </div>
        </div>

        {/* v1.2 Track Y — stat strip with group-streak pill, model/source mix,
            and headline totals. Uses the leaderboard range as the single
            source of truth. */}
        <RoomStatStrip code={room.code} range={range} />

        {/* v1.2 Track Y — room heatmap, 60d default with 52w toggle. */}
        <RoomHeatmap code={room.code} />

        {/* Tab bar */}
        <div className="flex gap-1 rounded-xl border border-zinc-800 bg-zinc-900 p-1 w-fit">
          {(["leaderboard", "activity", "challenges"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => handleSwitchTab(tab)}
              className={[
                "rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors capitalize",
                tab === activeTab
                  ? "bg-rat-500 text-white shadow"
                  : "text-zinc-400 hover:text-zinc-200",
              ].join(" ")}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab: Leaderboard */}
        {activeTab === "leaderboard" && (
          <>
            {/* Range toggle */}
            <div className="flex gap-1 rounded-xl border border-zinc-800 bg-zinc-900 p-1 w-fit">
              {RANGES.map((r) => (
                <button
                  key={r}
                  onClick={() => switchRange(r)}
                  className={[
                    "rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
                    r === range
                      ? "bg-zinc-700 text-white shadow"
                      : "text-zinc-400 hover:text-zinc-200",
                  ].join(" ")}
                >
                  {RANGE_LABELS[r]}
                </button>
              ))}
            </div>

            {viewerNeedsSync && <SyncHint />}

            <div
              className={`transition-opacity duration-150 ${leaderboardLoading ? "opacity-40" : "opacity-100"}`}
            >
              {leaderboard.rows.length === 0 ? (
                <EmptyLeaderboard />
              ) : (
                <LeaderboardTable
                  rows={leaderboard.rows}
                  streakByUser={streakByUser}
                  currentUserId={currentUserId}
                />
              )}
            </div>
          </>
        )}

        {/* Tab: Activity */}
        {activeTab === "activity" && <ActivityFeed activity={activity} loading={activityLoading} />}

        {/* Tab: Challenges */}
        {activeTab === "challenges" && (
          <ChallengesPanel
            active={activeChallenges}
            past={pastChallenges}
            loading={challengesLoading}
            onCreateChallenge={handleCreateChallenge}
          />
        )}
      </main>
    </div>
  );
}

function SyncHint() {
  return (
    <div className="rounded-xl border border-rat-500/40 bg-rat-500/5 px-4 py-3 text-sm text-zinc-300">
      <span className="font-bold text-rat-400">You&apos;re in!</span> Run{" "}
      <code className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-rat-400">
        npx token-rats sync
      </code>{" "}
      from your terminal to start showing up on the leaderboard.
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

function LeaderboardTable({
  rows,
  streakByUser,
  currentUserId,
}: {
  rows: Leaderboard["rows"];
  streakByUser: Map<string, StreakRow>;
  currentUserId?: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
      {/* Desktop header */}
      <div className="hidden grid-cols-[48px_1fr_100px_140px_120px_80px] border-b border-zinc-800 px-4 py-3 text-xs font-semibold uppercase tracking-widest text-zinc-500 sm:grid">
        <span>#</span>
        <span>Developer</span>
        <span className="text-right">Streak</span>
        <span className="text-right">Tokens</span>
        <span className="text-right">$ Spent</span>
        <span className="text-right">Sessions</span>
      </div>

      {rows.map((row) => {
        const streak = streakByUser.get(row.userId);
        const isCurrentUser = row.userId === currentUserId;
        return (
          <a
            key={row.userId}
            href={`/u/${row.handle}`}
            className={[
              "group flex items-center gap-3 border-b border-zinc-800 px-4 py-4 last:border-0 transition-colors sm:grid sm:grid-cols-[48px_1fr_100px_140px_120px_80px]",
              isCurrentUser ? "bg-rat-500/5 hover:bg-rat-500/10" : "hover:bg-zinc-800/50",
            ].join(" ")}
          >
            <RankBadge rank={row.rank} />
            <div className="flex min-w-0 items-center gap-2">
              <Avatar src={row.avatarUrl} handle={row.handle} size="sm" />
              <span className="truncate font-semibold group-hover:text-rat-400">@{row.handle}</span>
              {isCurrentUser && (
                <span className="rounded-md bg-rat-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rat-400">
                  you
                </span>
              )}
              {row.topSources && row.topSources.length > 0 && (
                <SourceBadges sources={row.topSources} />
              )}
            </div>
            {/* Streak badge */}
            <div className="hidden sm:flex sm:justify-end">
              {streak ? (
                <StreakBadge
                  currentStreak={streak.currentStreak}
                  longestStreak={streak.longestStreak}
                />
              ) : (
                <span className="text-xs text-zinc-700">—</span>
              )}
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
        );
      })}
    </div>
  );
}
