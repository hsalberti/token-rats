"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError, api } from "../../../lib/api";

interface Props {
  code: string;
  cookieHeader: string;
}

// Persist joined rooms in localStorage (same stopgap as dashboard)
function saveRoomCode(code: string) {
  if (typeof window === "undefined") return;
  try {
    const codes = JSON.parse(localStorage.getItem("tr_room_codes") ?? "[]") as string[];
    if (!codes.includes(code)) {
      localStorage.setItem("tr_room_codes", JSON.stringify([...codes, code]));
    }
  } catch {
    // ignore
  }
}

export function JoinClient({ code, cookieHeader }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: one-shot join on mount; code + cookieHeader are page-load constants
  useEffect(() => {
    let cancelled = false;
    api
      .joinRoom(code as Parameters<typeof api.joinRoom>[0], cookieHeader)
      .then(() => {
        if (cancelled) return;
        saveRoomCode(code);
        router.replace(`/r/${code}`);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 409) {
          // Already a member — just redirect
          saveRoomCode(code);
          router.replace(`/r/${code}`);
          return;
        }
        setError(err instanceof ApiError ? err.message : "Failed to join room.");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-6">
        <div className="w-full max-w-sm rounded-2xl border border-red-900 bg-zinc-900 p-8 text-center">
          <p className="text-2xl font-black text-red-400">Couldn&apos;t join</p>
          <p className="mt-2 text-sm text-zinc-400">{error}</p>
          <a
            href="/app"
            className="mt-6 inline-block rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-300 hover:bg-zinc-700"
          >
            Go to dashboard
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-6">
      <div className="w-full max-w-sm text-center">
        <div className="mb-4 animate-spin text-4xl">🐀</div>
        <p className="text-lg font-bold text-zinc-300">Joining room…</p>
        <p className="mt-1 text-sm text-zinc-500">Hold tight.</p>
      </div>
    </div>
  );
}
