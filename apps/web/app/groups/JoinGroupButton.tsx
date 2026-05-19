"use client";

/**
 * v1.2 Track AE — "Join" button on the public groups list.
 *
 * Posts to `/v1/rooms/:code/join`. If the API returns 403 country_locked
 * (e.g. the viewer's edge changed between page render and click), we
 * surface the mismatch inline rather than navigating away.
 */

import type { RoomCode } from "@token-rats/contracts";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, api } from "../../lib/api";

interface Props {
  code: string;
  viewerCountry: string;
  roomCountry: string;
}

export function JoinGroupButton({ code, viewerCountry, roomCountry }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleJoin() {
    setBusy(true);
    setError(null);
    try {
      await api.joinRoom(code as RoomCode);
      router.push(`/r/${code}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        setError(
          `Country mismatch — this room is locked to ${roomCountry}, but you're on ${viewerCountry}.`,
        );
      } else {
        setError("Couldn't join. Try again in a moment.");
      }
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleJoin}
        disabled={busy}
        className="rounded-lg bg-rat-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-rat-600 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Joining…" : "Join"}
      </button>
      {error && <p className="text-right text-xs text-red-400">{error}</p>}
    </div>
  );
}
