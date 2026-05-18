"use client";

/**
 * Dashboard client component.
 *
 * NOTE: The v1 API contract does not include a "list my rooms" endpoint.
 * As a stopgap we store room codes the user has joined/created in localStorage
 * under the key "tr_room_codes", then hydrate each room via GET /v1/rooms/:code.
 * Track G in Phase 2 should add GET /v1/me/rooms to the API and replace this.
 */

import { useEffect, useReducer, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "../../lib/api";
import type { Room, User } from "@token-rats/contracts";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";

const ROOMS_KEY = "tr_room_codes";

function loadRoomCodes(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(ROOMS_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function saveRoomCode(code: string) {
  const codes = loadRoomCodes();
  if (!codes.includes(code)) {
    localStorage.setItem(ROOMS_KEY, JSON.stringify([...codes, code]));
  }
}

function removeRoomCode(code: string) {
  const codes = loadRoomCodes().filter((c) => c !== code);
  localStorage.setItem(ROOMS_KEY, JSON.stringify(codes));
}

interface Props {
  user: User;
  cookieHeader: string;
}

type RoomEntry = { code: string; room: Room | null; loading: boolean; error: string | null };

export function DashboardClient({ user: _user, cookieHeader }: Props) {
  const router = useRouter();
  const [rooms, setRooms] = useState<RoomEntry[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Force re-render after hydration
  const [hydrated, setHydrated] = useReducer(() => true, false);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const codes = loadRoomCodes();
    setRooms(codes.map((code) => ({ code, room: null, loading: true, error: null })));
    setHydrated();

    codes.forEach((code) => {
      api.getRoom(code as Parameters<typeof api.getRoom>[0], cookieHeader)
        .then((data) => {
          setRooms((prev) =>
            prev.map((r) =>
              r.code === code ? { ...r, room: data.room, loading: false } : r,
            ),
          );
        })
        .catch(() => {
          setRooms((prev) =>
            prev.map((r) =>
              r.code === code
                ? { ...r, loading: false, error: "Could not load room" }
                : r,
            ),
          );
        });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!roomName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const data = await api.createRoom(
        { name: roomName.trim() },
        cookieHeader,
      );
      saveRoomCode(data.room.code);
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
      saveRoomCode(code);
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
        <h1 className="text-3xl font-black tracking-tight">
          Your rooms
        </h1>
        <p className="mt-1 text-zinc-400">
          Create a room, invite friends, climb the board.
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => { setCreateOpen(true); setJoinOpen(false); setError(null); }}>
          + Create room
        </Button>
        <Button variant="secondary" onClick={() => { setJoinOpen(true); setCreateOpen(false); setError(null); }}>
          Join by code
        </Button>
      </div>

      {/* Create room form */}
      {createOpen && (
        <Card>
          <h2 className="mb-4 text-lg font-bold">Create a room</h2>
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <div>
              <label htmlFor="room-name" className="mb-1.5 block text-sm font-semibold text-zinc-300">
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
              <label htmlFor="join-code" className="mb-1.5 block text-sm font-semibold text-zinc-300">
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
      {hydrated && rooms.length === 0 && (
        <div className="rounded-xl border border-dashed border-zinc-700 px-8 py-16 text-center">
          <p className="text-4xl">🐀</p>
          <p className="mt-3 text-lg font-bold text-zinc-300">No rooms yet</p>
          <p className="mt-1 text-sm text-zinc-500">
            Create a room and invite your crew to start tracking.
          </p>
        </div>
      )}

      {rooms.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {rooms.map((entry) => (
            <RoomCard
              key={entry.code}
              entry={entry}
              onRemove={() => {
                removeRoomCode(entry.code);
                setRooms((prev) => prev.filter((r) => r.code !== entry.code));
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RoomCard({ entry, onRemove }: { entry: RoomEntry; onRemove: () => void }) {
  if (entry.loading) {
    return (
      <div className="h-28 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900" />
    );
  }
  if (entry.error) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <p className="text-sm font-mono text-zinc-400">{entry.code}</p>
        <p className="mt-1 text-xs text-red-400">{entry.error}</p>
        <button
          onClick={onRemove}
          className="mt-2 text-xs text-zinc-600 hover:text-zinc-400"
        >
          Remove
        </button>
      </div>
    );
  }
  if (!entry.room) return null;
  return (
    <a
      href={`/r/${entry.room.code}`}
      className="group rounded-xl border border-zinc-800 bg-zinc-900 p-5 transition-colors hover:border-rat-700 hover:bg-zinc-800"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold group-hover:text-rat-400">{entry.room.name}</p>
          <p className="mt-0.5 font-mono text-xs text-zinc-500">{entry.room.code}</p>
        </div>
        <span className="rounded-lg bg-zinc-800 px-2 py-1 text-xs text-zinc-400 group-hover:bg-zinc-700">
          View →
        </span>
      </div>
    </a>
  );
}
