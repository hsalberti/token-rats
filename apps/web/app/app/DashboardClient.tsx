"use client";

/**
 * Dashboard client component.
 *
 * Mission Principle #4: every screen screenshot-worthy. The two cards at the
 * top are the persistent explainers ("create a board" / "hit the global
 * leaderboards") so a friend dropped on the dashboard via a share link sees
 * the social loop instantly.
 *
 * // Track GH (Phase 2): replaced localStorage stopgap with GET /v1/me/rooms.
 */

import type { Room, User } from "@token-rats/contracts";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { GlobalBoardPreview } from "../../components/GlobalBoardPreview";
import { PinnedRoomPreview } from "../../components/PinnedRoomPreview";
import { SourcePicker } from "../../components/SourcePicker";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { ApiError, api } from "../../lib/api";

interface Props {
  user: User;
  cookieHeader: string;
  /** ISO alpha-2 (e.g. "DE") from cf-ipcountry, or null when unresolvable. */
  viewerCountry: string | null;
}

const COUNTRY_FLAGS = (cc: string): string =>
  cc
    .toUpperCase()
    .split("")
    .map((c) => String.fromCodePoint(127397 + c.charCodeAt(0)))
    .join("");

function countryLabel(cc: string): string {
  try {
    const names = new Intl.DisplayNames(["en"], { type: "region" });
    return names.of(cc) ?? cc;
  } catch {
    return cc;
  }
}

export function DashboardClient({ user, cookieHeader, viewerCountry }: Props) {
  const router = useRouter();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [makePublic, setMakePublic] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional mount-only effect.
  useEffect(() => {
    api
      .getMyRooms(cookieHeader)
      .then((data) => setRooms(data.rooms))
      .catch(() => undefined)
      .finally(() => setRoomsLoading(false));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!roomName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const data = await api.createRoom(
        { name: roomName.trim(), isPublic: makePublic },
        cookieHeader,
      );
      router.push(`/r/${data.room.code}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create room");
      setBusy(false);
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    const code = joinCode.trim().toLowerCase();
    if (!code) return;
    setBusy(true);
    setError(null);
    try {
      await api.joinRoom(code as Parameters<typeof api.joinRoom>[0], cookieHeader);
      router.push(`/r/${code}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to join room");
      setBusy(false);
    }
  }

  async function togglePin(room: Room) {
    const prevRooms = rooms;
    const willPin = !room.isPinned;
    setRooms((rs) =>
      rs.map((r) => ({
        ...r,
        isPinned: willPin ? r.code === room.code : r.isPinned && r.code !== room.code,
      })),
    );
    try {
      if (willPin) {
        await api.pinRoom(room.code, cookieHeader);
      } else {
        await api.unpinRoom(room.code, cookieHeader);
      }
    } catch {
      setRooms(prevRooms);
    }
  }

  const pinnedRoom = rooms.find((r) => r.isPinned) ?? null;
  const hasRooms = rooms.length > 0;
  const skeletonCount = Math.max(1, Math.min(rooms.length || 2, 4));

  return (
    <div className="space-y-8">
      {/* Two-card social explainer — the persistent "how to play" affordance. */}
      <section className="grid gap-4 sm:grid-cols-2">
        <ActionCard
          tone="rat"
          eyebrow="With friends"
          title="Create a board"
          body="Compete with your crew. Token-mogg them all week."
          icon={<RatIcon />}
          cta="+ Create board"
          onClick={() => {
            setCreateOpen(true);
            setError(null);
            if (typeof window !== "undefined") {
              setTimeout(
                () => document.getElementById("create-room-name")?.focus({ preventScroll: false }),
                0,
              );
            }
          }}
        />
        <ActionCard
          tone="globe"
          eyebrow="Public boards"
          title="Hit the global leaderboards"
          body="Compete countrywide or worldwide. Opt-in, public."
          icon={<GlobeIcon />}
          cta={
            viewerCountry
              ? `${COUNTRY_FLAGS(viewerCountry)} ${countryLabel(viewerCountry)} board`
              : "Global trending"
          }
          href={viewerCountry ? "/groups" : "/trending"}
          secondaryCta={viewerCountry ? "Global trending" : undefined}
          secondaryHref={viewerCountry ? "/trending" : undefined}
        />
      </section>

      {/* Create form drops in just below the cards when "Create board" is clicked. */}
      {createOpen && (
        <Card>
          <h2 className="mb-4 text-lg font-bold">Name your board</h2>
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <div>
              <label
                htmlFor="create-room-name"
                className="mb-1.5 block text-sm font-semibold text-zinc-300"
              >
                Board name
              </label>
              <input
                id="create-room-name"
                type="text"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="e.g. Weekend Builders"
                maxLength={64}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-zinc-100 placeholder-zinc-500 focus:border-rat-500 focus:outline-none focus:ring-1 focus:ring-rat-500"
              />
            </div>

            {viewerCountry ? (
              <label className="flex items-start gap-3 text-sm text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={makePublic}
                  onChange={(e) => setMakePublic(e.target.checked)}
                  className="mt-1 h-4 w-4 accent-rat-500"
                />
                <span>
                  Make this board public for{" "}
                  <span className="font-semibold text-zinc-100">
                    {COUNTRY_FLAGS(viewerCountry)} {countryLabel(viewerCountry)}
                  </span>
                  .{" "}
                  <span className="text-xs text-zinc-500">
                    Listed on /groups; joinable by anyone in {viewerCountry}.
                  </span>
                </span>
              </label>
            ) : (
              <p className="text-xs text-zinc-500">
                We couldn&apos;t detect your country, so public boards aren&apos;t available here.
              </p>
            )}

            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex gap-3">
              <Button type="submit" disabled={busy || !roomName.trim()}>
                {busy ? "Creating…" : "Create board"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Global leaderboard preview — competitive view. */}
      <GlobalBoardPreview
        viewerUserId={user.id}
        viewerPublicProfile={user.publicProfile === true}
      />

      {/* Pinned room preview — only when the user has at least one room. */}
      {pinnedRoom && <PinnedRoomPreview room={pinnedRoom} viewerUserId={user.id} />}

      {/* Your boards */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-xl font-bold tracking-tight">Your boards</h2>
          {hasRooms && (
            <a
              href="/app/friends"
              className="text-sm text-zinc-500 hover:text-rat-400 transition-colors"
            >
              Friends →
            </a>
          )}
        </div>

        {roomsLoading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: skeletonCount }).map((_, i) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length skeleton list.
                key={i}
                className="h-28 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900"
              />
            ))}
          </div>
        ) : !hasRooms ? (
          <div className="rounded-xl border border-dashed border-zinc-700 px-8 py-12 text-center">
            <p className="text-4xl">🐀</p>
            <p className="mt-3 text-base font-bold text-zinc-300">No boards yet</p>
            <p className="mt-1 text-sm text-zinc-500">
              Create one above, or paste a code below to join a friend&apos;s.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {rooms.map((room) => (
              <RoomCard key={room.code} room={room} onTogglePin={() => togglePin(room)} />
            ))}
          </div>
        )}

        {/* Join by code — small persistent affordance, always visible. */}
        <form
          onSubmit={handleJoin}
          className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4"
        >
          <div className="min-w-[200px] flex-1">
            <label
              htmlFor="join-code"
              className="mb-1 block text-xs font-semibold uppercase tracking-widest text-zinc-500"
            >
              Got an invite code?
            </label>
            <input
              id="join-code"
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="e.g. abc-xyz"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 font-mono text-sm text-zinc-100 placeholder-zinc-500 focus:border-rat-500 focus:outline-none focus:ring-1 focus:ring-rat-500"
            />
          </div>
          <Button type="submit" variant="secondary" size="sm" disabled={busy || !joinCode.trim()}>
            {busy ? "Joining…" : "Join board"}
          </Button>
        </form>
        {error && !createOpen && <p className="text-sm text-red-400">{error}</p>}
      </section>

      {/* Add a source — sync flow lives below the social layer. */}
      <section className="space-y-3 pt-2">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Add a source</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Pick where your tokens live. The CLI handles the rest — counts only, never prompts.
          </p>
        </div>
        <SourcePicker />
      </section>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Action card — the social explainer pair                                    */
/* -------------------------------------------------------------------------- */

interface ActionCardProps {
  tone: "rat" | "globe";
  eyebrow: string;
  title: string;
  body: string;
  icon: React.ReactNode;
  cta: string;
  href?: string;
  onClick?: () => void;
  secondaryCta?: string;
  secondaryHref?: string;
}

function ActionCard({
  tone,
  eyebrow,
  title,
  body,
  icon,
  cta,
  href,
  onClick,
  secondaryCta,
  secondaryHref,
}: ActionCardProps) {
  const accent =
    tone === "rat"
      ? "from-rat-500/20 via-rat-500/5 to-transparent border-rat-700/40 hover:border-rat-500/70"
      : "from-sky-500/15 via-sky-500/5 to-transparent border-sky-700/40 hover:border-sky-500/70";
  const iconWrap =
    tone === "rat"
      ? "bg-rat-500/15 text-rat-400 ring-1 ring-rat-500/30"
      : "bg-sky-500/15 text-sky-400 ring-1 ring-sky-500/30";
  const ctaClasses =
    tone === "rat"
      ? "bg-rat-500 text-white shadow-lg shadow-rat-900/40 hover:bg-rat-600"
      : "bg-sky-500 text-white shadow-lg shadow-sky-900/40 hover:bg-sky-600";

  const CTA = href ? (
    <a
      href={href}
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold transition-colors ${ctaClasses}`}
    >
      {cta} <span aria-hidden>→</span>
    </a>
  ) : (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold transition-colors ${ctaClasses}`}
    >
      {cta}
    </button>
  );

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border bg-gradient-to-br p-6 transition-colors ${accent}`}
    >
      <div
        className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl ${iconWrap}`}
      >
        {icon}
      </div>
      <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">{eyebrow}</p>
      <h3 className="mt-1 text-xl font-black tracking-tight text-zinc-100">{title}</h3>
      <p className="mt-2 text-sm text-zinc-400">{body}</p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        {CTA}
        {secondaryCta && secondaryHref && (
          <a
            href={secondaryHref}
            className="text-sm font-semibold text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            {secondaryCta} →
          </a>
        )}
      </div>
    </div>
  );
}

function RatIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
      aria-hidden="true"
    >
      <title>Friends</title>
      <path d="M16 11a3 3 0 1 0-3-3" />
      <path d="M8 11a3 3 0 1 0-3-3" />
      <path d="M12 14a5 5 0 0 0-5 5h10a5 5 0 0 0-5-5z" />
      <path d="M17 14a4 4 0 0 1 4 5h-3" />
      <path d="M7 14a4 4 0 0 0-4 5h3" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
      aria-hidden="true"
    >
      <title>Global</title>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a14 14 0 0 1 0 18" />
      <path d="M12 3a14 14 0 0 0 0 18" />
    </svg>
  );
}

function RoomCard({ room, onTogglePin }: { room: Room; onTogglePin: () => void }) {
  const isPinned = room.isPinned === true;
  return (
    <div className="group relative rounded-xl border border-zinc-800 bg-zinc-900 transition-colors hover:border-rat-700 hover:bg-zinc-800">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onTogglePin();
        }}
        aria-label={isPinned ? "Unpin board" : "Pin board"}
        aria-pressed={isPinned}
        className={[
          "absolute right-3 top-3 z-10 rounded-lg p-1.5 text-base leading-none transition-colors",
          isPinned
            ? "text-amber-400 hover:bg-zinc-800"
            : "text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300",
        ].join(" ")}
        title={isPinned ? "Pinned · click to unpin" : "Pin to dashboard preview"}
      >
        {isPinned ? "★" : "☆"}
      </button>
      <a href={`/r/${room.code}`} className="block p-5 pr-12">
        <p className="font-bold group-hover:text-rat-400">{room.name}</p>
        <p className="mt-0.5 font-mono text-xs text-zinc-500">{room.code}</p>
      </a>
    </div>
  );
}
