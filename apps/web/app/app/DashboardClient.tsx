"use client";

/**
 * Dashboard client component.
 *
 * // Track GH (Phase 2): replaced localStorage stopgap with GET /v1/me/rooms.
 * Rooms are now loaded directly from the API rather than being stored in
 * localStorage under "tr_room_codes". This means rooms appear on any device
 * immediately after sign-in.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "../../lib/api";
import type { Room, User } from "@token-rats/contracts";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";

interface Props {
  user: User;
  cookieHeader: string;
}

export function DashboardClient({ user: _user, cookieHeader }: Props) {
  const router = useRouter();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track GH (Phase 2): load rooms from GET /v1/me/rooms instead of localStorage
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!roomName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const data = await api.createRoom({ name: roomName.trim() }, cookieHeader);
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

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <div>
        <h1 className="text-3xl font-black tracking-tight">Your rooms</h1>
        <p className="mt-1 text-zinc-400">Create a room, invite friends, climb the board.</p>
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
            <div key={i} className="h-28 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900" />
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
            <RoomCard key={room.code} room={room} />
          ))}
        </div>
      )}
    </div>
  );
}

function RoomCard({ room }: { room: Room }) {
  return (
    <a
      href={`/r/${room.code}`}
      className="group rounded-xl border border-zinc-800 bg-zinc-900 p-5 transition-colors hover:border-rat-700 hover:bg-zinc-800"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold group-hover:text-rat-400">{room.name}</p>
          <p className="mt-0.5 font-mono text-xs text-zinc-500">{room.code}</p>
        </div>
        <span className="rounded-lg bg-zinc-800 px-2 py-1 text-xs text-zinc-400 group-hover:bg-zinc-700">
          View →
        </span>
      </div>
    </a>
  );
}
