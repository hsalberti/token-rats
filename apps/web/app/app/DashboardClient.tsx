"use client";

/**
 * Dashboard client component.
 *
 * // Track GH (Phase 2): replaced localStorage stopgap with GET /v1/me/rooms.
 * Rooms are now loaded directly from the API rather than being stored in
 * localStorage under "tr_room_codes". This means rooms appear on any device
 * immediately after sign-in.
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
  const [joinOpen, setJoinOpen] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [makePublic, setMakePublic] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track GH (Phase 2): load rooms from GET /v1/me/rooms instead of localStorage
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional mount-only effect.
  useEffect(() => {
    api
      .getMyRooms(cookieHeader)
      .then((data) => {
        setRooms(data.rooms);
      })
      .catch(() => {
        // silently fall through to empty state
      })
      .finally(() => {
        setRoomsLoading(false);
      });
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

  // Optimistic pin/unpin. The server enforces single-pin-per-user via a
  // partial unique index; if the call fails we revert local state.
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

  return (
    <div className="space-y-8">
      {/* Global leaderboard preview — competitive view first. */}
      <GlobalBoardPreview
        viewerUserId={user.id}
        viewerPublicProfile={user.publicProfile === true}
      />

      {/* Pinned room preview — only when the user has at least one room. */}
      {pinnedRoom && <PinnedRoomPreview room={pinnedRoom} viewerUserId={user.id} />}

      {/* Welcome */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Your rooms</h1>
          <p className="mt-1 text-zinc-400">Create a room, invite friends, climb the board.</p>
        </div>
        <a
          href="/settings/referrals"
          className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm font-semibold text-zinc-300 hover:border-rat-700 hover:text-rat-400 transition-colors"
        >
          Invite friends →
        </a>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
        <Button
          onClick={() => {
            setCreateOpen(true);
            setJoinOpen(false);
            setError(null);
          }}
        >
          + Create room
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            setJoinOpen(true);
            setCreateOpen(false);
            setError(null);
          }}
        >
          Join by code
        </Button>
      </div>

      {/* Create room form */}
      {createOpen && (
        <Card>
          <h2 className="mb-4 text-lg font-bold">Create a room</h2>
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <div>
              <label
                htmlFor="room-name"
                className="mb-1.5 block text-sm font-semibold text-zinc-300"
              >
                Room name
              </label>
              <input
                id="room-name"
                type="text"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="e.g. Weekend Builders"
                maxLength={64}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-zinc-100 placeholder-zinc-500 focus:border-rat-500 focus:outline-none focus:ring-1 focus:ring-rat-500"
              />
            </div>

            {/* v1.2: optional public-country room. The country is read-only —
                it's whatever Cloudflare resolves for the creator. */}
            {viewerCountry ? (
              <label className="flex items-start gap-3 text-sm text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={makePublic}
                  onChange={(e) => setMakePublic(e.target.checked)}
                  className="mt-1 h-4 w-4 accent-rat-500"
                />
                <span>
                  Make this a public room for{" "}
                  <span className="font-semibold text-zinc-100">
                    {COUNTRY_FLAGS(viewerCountry)} {countryLabel(viewerCountry)}
                  </span>
                  .{" "}
                  <span className="text-xs text-zinc-500">
                    Listed on /groups in your country; joinable by anyone in {viewerCountry}.
                  </span>
                </span>
              </label>
            ) : (
              <p className="text-xs text-zinc-500">
                We couldn't detect your country, so public rooms aren't available. Try a different
                network or VPN region.
              </p>
            )}

            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex gap-3">
              <Button type="submit" disabled={busy || !roomName.trim()}>
                {busy ? "Creating…" : "Create room"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Join room form */}
      {joinOpen && (
        <Card>
          <h2 className="mb-4 text-lg font-bold">Join a room</h2>
          <form onSubmit={handleJoin} className="flex flex-col gap-4">
            <div>
              <label
                htmlFor="join-code"
                className="mb-1.5 block text-sm font-semibold text-zinc-300"
              >
                Room code
              </label>
              <input
                id="join-code"
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="e.g. abc-xyz"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 font-mono text-zinc-100 placeholder-zinc-500 focus:border-rat-500 focus:outline-none focus:ring-1 focus:ring-rat-500"
              />
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex gap-3">
              <Button type="submit" disabled={busy || !joinCode.trim()}>
                {busy ? "Joining…" : "Join room"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setJoinOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Room list */}
      {roomsLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[...Array(2)].map((_, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length skeleton list.
              key={i}
              className="h-28 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900"
            />
          ))}
        </div>
      ) : rooms.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-700 px-8 py-16 text-center">
          <p className="text-4xl">🐀</p>
          <p className="mt-3 text-lg font-bold text-zinc-300">No rooms yet</p>
          <p className="mt-1 text-sm text-zinc-500">
            Create a room and invite your crew to start tracking.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {rooms.map((room) => (
            <RoomCard key={room.code} room={room} onTogglePin={() => togglePin(room)} />
          ))}
        </div>
      )}

      {/* Add a source — picker per roadmap-providers.md Track D */}
      <div className="space-y-3 pt-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Add a source</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Pick where your tokens live. The CLI handles the rest — counts only, never prompts.
          </p>
        </div>
        <SourcePicker />
      </div>
    </div>
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
        aria-label={isPinned ? "Unpin room" : "Pin room"}
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
