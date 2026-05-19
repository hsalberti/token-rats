"use client";

import type {
  ActivityRow,
  ChallengeKind,
  ChallengeWithLeaderboard,
  GroupStreak,
  Heatmap,
  Leaderboard,
  LeaderboardRange,
  LiveEvent,
  Room,
  RoomCode,
  RoomMember,
  RoomSummary,
  StreakRow,
} from "@token-rats/contracts";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { HeatmapWithToggle } from "../../../components/HeatmapWithToggle";
import { SourceBadges } from "../../../components/SourceBadge";
import { TwitterHandlePill } from "../../../components/TwitterHandlePill";
import { ActivityFeed } from "../../../components/room/ActivityFeed";
import { ChallengesPanel } from "../../../components/room/ChallengesPanel";
import { RenameRoomForm } from "../../../components/room/RenameRoomForm";
import { StreakBadge } from "../../../components/room/StreakBadge";
import { Avatar } from "../../../components/ui/Avatar";
import { Button } from "../../../components/ui/Button";
import { RankBadge } from "../../../components/ui/RankBadge";
import { Wordmark } from "../../../components/ui/Wordmark.js";
import { ApiError, api } from "../../../lib/api";
import { useRoomLive } from "../../../lib/use-room-live";

interface Props {
  summary: RoomSummary;
  room: Room;
  members: RoomMember[];
  initialLeaderboard: Leaderboard;
  heatmap: Heatmap | null;
  groupStreak: GroupStreak | null;
  cookieHeader: string;
  currentUserId?: string;
  footer: ReactNode;
}

type Tab = "leaderboard" | "activity" | "challenges";

const RANGE_LABELS: Record<LeaderboardRange, string> = {
  today: "Today",
  "7d": "7 days",
  "30d": "30 days",
  all: "All time",
};
const SHARE_RANGE_LABELS: Record<LeaderboardRange, string> = {
  today: "Today",
  "7d": "Past 7 days",
  "30d": "Past 30 days",
  all: "All time",
};
const RANGES: LeaderboardRange[] = ["today", "7d", "30d", "all"];
const MEDALS = ["🥇", "🥈", "🥉"];

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

function buildShareText(opts: {
  roomName: string;
  roomCode: string;
  range: LeaderboardRange;
  rows: Leaderboard["rows"];
  totalTokens: number;
}): string {
  const { roomName, roomCode, range, rows, totalTokens } = opts;
  const joinUrl = `https://tokenrats.com/join/${roomCode}`;
  const top = rows.slice(0, 3);

  if (top.length === 0) {
    return `[TR🔶🐭] ${roomName}\n\nJoin the rats:\n${joinUrl}`;
  }

  const lines = [
    `[TR🔶🐭] ${roomName} — ${SHARE_RANGE_LABELS[range]}`,
    ...top.map((r, i) => `${MEDALS[i]} @${r.handle} ${fmtTokens(r.tokens)}`),
    "",
    `${fmtTokens(totalTokens)} tokens burned`,
    "",
    joinUrl,
  ];
  return lines.join("\n");
}

/**
 * Invite-link copy. Same `[TR🔶🐭]` brand mark + URL-on-its-own-line layout as
 * the share-recap text so the two messages read like they came out of the same
 * mouth. The URL stays as the last token so X / iMessage previews lock onto it.
 */
function buildInviteText(opts: { roomName: string; joinUrl: string }): string {
  return [
    `[TR🔶🐭] You're invited to ${opts.roomName}`,
    "",
    "Auto-tracked Claude Code + Cursor leaderboard with your crew.",
    "",
    opts.joinUrl,
  ].join("\n");
}

export function RoomView({
  summary,
  room: initialRoom,
  members,
  initialLeaderboard,
  heatmap,
  groupStreak,
  cookieHeader,
  currentUserId,
  footer,
}: Props) {
  const [room, setRoom] = useState<Room>(initialRoom);
  const [activeTab, setActiveTab] = useState<Tab>("leaderboard");
  const [range, setRange] = useState<LeaderboardRange>("30d");
  const [leaderboard, setLeaderboard] = useState<Leaderboard>(initialLeaderboard);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [renamingRoom, setRenamingRoom] = useState(false);
  // Cached referral code for tagging invite links so we can credit whoever
  // shared the room when a new friend signs up.
  const [inviterRef, setInviterRef] = useState<string | null>(null);

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
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional mount-only effect.
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
  }, []);

  // Pre-fetch the inviter's referral code on mount so "Copy invite link"
  // can attach `?ref=` without an extra round-trip — and so a signup via
  // this invite gets credited back to the inviter even on a slow network.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional mount-only effect.
  useEffect(() => {
    if (inviterRef) return;
    api
      .getReferral(cookieHeader)
      .then((data) => setInviterRef(data.referral.code))
      .catch(() => {
        // Non-fatal — handleInvite will retry on click.
      });
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

  const totalTokens = leaderboard.rows.reduce((s, r) => s + r.tokens, 0);

  async function handleShare() {
    const text = buildShareText({
      roomName: room.name,
      roomCode: room.code,
      range,
      rows: leaderboard.rows,
      totalTokens,
    });
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ text });
        return;
      } catch (err) {
        // AbortError = user dismissed the share sheet; any other error falls through to copy.
        if (err instanceof Error && err.name === "AbortError") return;
      }
    }
    copyText(text);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  }

  async function handleInvite() {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://tokenrats.com";

    let ref = inviterRef;
    if (!ref) {
      try {
        const data = await api.getReferral();
        ref = data.referral.code;
        setInviterRef(ref);
      } catch {
        // Non-fatal — fall back to an un-tagged invite link.
      }
    }

    const joinUrl = ref
      ? `${origin}/join/${room.code}?ref=${encodeURIComponent(ref)}`
      : `${origin}/join/${room.code}`;
    const text = buildInviteText({ roomName: room.name, joinUrl });

    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ text });
        return;
      } catch (err) {
        // AbortError = user dismissed the share sheet; otherwise fall through to copy.
        if (err instanceof Error && err.name === "AbortError") return;
      }
    }

    copyText(text);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
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
          <a href="/">
            <Wordmark size="md" />
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
                    type="button"
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
                      role="img"
                      aria-label="Rename room"
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
            <Button variant="secondary" size="sm" onClick={handleShare}>
              {shareCopied ? "Copied!" : "Share recap"}
            </Button>
            <Button variant="secondary" size="sm" onClick={handleInvite}>
              {inviteCopied ? "Copied!" : "Copy invite link"}
            </Button>
          </div>
        </div>

        {/* Stat strip — driven by RoomSummary (public, 30d window). */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard label="Members" value={`${summary.memberCount}`} />
          <StatCard label="30d tokens" value={fmtTokens(summary.total30dTokens)} primary />
          <StatCard
            label="30d spent"
            value={fmtCost(summary.total30dCostUsdCents)}
            className="col-span-2 sm:col-span-1"
          />
        </div>

        {/* Group streak pill */}
        {groupStreak && groupStreak.currentStreak > 0 && (
          <div className="inline-flex items-center gap-2 rounded-full border border-rat-500/40 bg-rat-500/10 px-3 py-1 text-sm font-semibold text-rat-400">
            <span aria-hidden>🔥</span>
            <span>{groupStreak.currentStreak}-day group streak</span>
          </div>
        )}

        {/* Members list — compact chip row. Drops the verified X pill when set. */}
        {members.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
              Members ({members.length})
            </h3>
            <ul className="flex flex-wrap gap-2">
              {members.map((m) => (
                <li
                  key={m.userId}
                  className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5"
                >
                  <Avatar src={m.avatarUrl} handle={m.handle} size="xs" />
                  <a href={`/u/${m.handle}`} className="text-sm font-semibold hover:text-rat-400">
                    @{m.handle}
                  </a>
                  <TwitterHandlePill handle={m.twitterHandle} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Tab bar */}
        <div className="flex gap-1 rounded-xl border border-zinc-800 bg-zinc-900 p-1 w-fit">
          {(["leaderboard", "activity", "challenges"] as Tab[]).map((tab) => (
            <button
              key={tab}
              type="button"
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
                  type="button"
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

            {/* Group activity heatmap */}
            {heatmap && heatmap.days.length > 0 && (
              <HeatmapWithToggle
                initial={heatmap}
                title="Group activity"
                fetcher={async (r) => {
                  const res = await api.getRoomHeatmap(room.code as RoomCode, r);
                  return res.heatmap;
                }}
              />
            )}
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
      {footer}
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
