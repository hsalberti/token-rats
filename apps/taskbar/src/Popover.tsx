/**
 * Main popover view. Renders:
 *  - User avatar + handle.
 *  - Today's spend ($ + tokens) — placeholder until `/v1/me/today` exists.
 *  - Current personal streak — placeholder.
 *  - Top-room rank — placeholder.
 *  - "Sync now" button — invokes the Rust-side `sync_now` command, which is a
 *    stub for v1.2. The real CLI sync path runs via the existing
 *    `token-rats` binary; wiring the parsers into the Tauri shell is
 *    deferred to v1.3.
 */

import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { GetMeResponse } from "@token-rats/contracts";
import type { JSX } from "react";
import { useCallback, useEffect, useState } from "react";
import { ApiClient } from "./lib/api.js";
import { deleteToken } from "./lib/token-store.js";

interface PopoverProps {
  token: string;
  onLoggedOut: () => void;
}

interface TodaySnapshot {
  costUsd: number;
  tokens: number;
  streakDays: number;
  topRoomRank: number | null;
  topRoomCode: string | null;
}

const PLACEHOLDER: TodaySnapshot = {
  costUsd: 0,
  tokens: 0,
  streakDays: 0,
  topRoomRank: null,
  topRoomCode: null,
};

function formatUsd(n: number): string {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}

export function Popover({ token, onLoggedOut }: PopoverProps): JSX.Element {
  const [me, setMe] = useState<GetMeResponse | null>(null);
  const [snapshot] = useState<TodaySnapshot>(PLACEHOLDER);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const client = new ApiClient({ token });
    let cancelled = false;
    (async () => {
      try {
        const res = await client.getMe();
        if (!cancelled) setMe(res);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const result = await invoke<string>("sync_now");
      setSyncMessage(result);
    } catch (e) {
      setSyncMessage(`Sync failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSyncing(false);
    }
  }, []);

  const handleLogout = useCallback(async () => {
    await deleteToken();
    onLoggedOut();
  }, [onLoggedOut]);

  const handleOpenDashboard = useCallback(() => {
    void openUrl("https://tokenrats.com/app").catch(() => {});
  }, []);

  const handle = me?.user.handle ?? "loading…";
  const avatarUrl = me?.user.avatarUrl ?? null;

  return (
    <div className="flex h-full flex-col p-4">
      <header className="mb-4 flex items-center gap-3">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            className="h-8 w-8 rounded-full bg-zinc-800"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="h-8 w-8 rounded-full bg-zinc-800" />
        )}
        <div className="flex-1">
          <p className="text-sm font-medium">@{handle}</p>
          <button
            type="button"
            onClick={handleOpenDashboard}
            className="text-xs text-zinc-400 hover:text-emerald-400"
          >
            Open dashboard ↗
          </button>
        </div>
      </header>

      <section className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-md bg-zinc-900 p-3">
          <p className="text-[10px] uppercase tracking-wide text-zinc-500">Today</p>
          <p className="text-lg font-semibold tabular-nums">{formatUsd(snapshot.costUsd)}</p>
          <p className="text-xs text-zinc-400 tabular-nums">{formatTokens(snapshot.tokens)} tok</p>
        </div>
        <div className="rounded-md bg-zinc-900 p-3">
          <p className="text-[10px] uppercase tracking-wide text-zinc-500">Streak</p>
          <p className="text-lg font-semibold tabular-nums">
            {snapshot.streakDays}
            <span className="ml-1 text-xs font-normal text-zinc-400">days</span>
          </p>
        </div>
      </section>

      <section className="mb-4 rounded-md bg-zinc-900 p-3">
        <p className="text-[10px] uppercase tracking-wide text-zinc-500">Top room</p>
        {snapshot.topRoomCode ? (
          <p className="text-sm">
            #{snapshot.topRoomRank} in{" "}
            <span className="font-mono text-emerald-400">{snapshot.topRoomCode}</span>
          </p>
        ) : (
          <p className="text-xs text-zinc-500">No room data yet.</p>
        )}
      </section>

      <button
        type="button"
        disabled={syncing}
        onClick={() => void handleSync()}
        className="mb-2 w-full rounded-md bg-emerald-500 px-3 py-2 text-sm font-medium text-zinc-950 hover:bg-emerald-400 disabled:opacity-60"
      >
        {syncing ? "Syncing…" : "Sync now"}
      </button>

      {syncMessage ? <p className="mb-2 text-xs text-zinc-400">{syncMessage}</p> : null}
      {error ? <p className="mb-2 text-xs text-red-400">{error}</p> : null}

      <footer className="mt-auto flex items-center justify-between text-xs text-zinc-500">
        <button type="button" onClick={() => void handleLogout()} className="hover:text-zinc-300">
          Sign out
        </button>
        <span>v0.1.0</span>
      </footer>
    </div>
  );
}
