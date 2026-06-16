"use client";

/**
 * FirstSyncWatcher — replaces the manual "Refresh" button on the no-sessions
 * onboarding view. Polls the user's own profile every few seconds and reloads
 * the page the moment the first synced session lands, so the autobiography
 * reveals itself without the user clicking anything.
 */

import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";

const POLL_INTERVAL_MS = 4000;

export function FirstSyncWatcher({
  handle,
  waitingLabel,
}: { handle: string; waitingLabel: string }) {
  const [active, setActive] = useState(true);
  const reloadedRef = useRef(false);

  useEffect(() => {
    if (!active) return;

    let cancelled = false;

    async function check() {
      try {
        const { profile } = await api.getProfile(handle);
        if (cancelled || reloadedRef.current) return;
        if (profile.totals.allTime.tokens > 0) {
          reloadedRef.current = true;
          window.location.reload();
        }
      } catch {
        // Best-effort — a failed poll just retries on the next tick.
      }
    }

    // Pause polling while the tab is hidden to avoid pointless background work.
    function onVisibility() {
      setActive(document.visibilityState === "visible");
    }
    document.addEventListener("visibilitychange", onVisibility);

    check();
    const id = setInterval(check, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [handle, active]);

  return (
    <span className="inline-flex items-center gap-2 text-sm text-zinc-500">
      <span className="h-2 w-2 animate-pulse rounded-full bg-rat-500" aria-hidden />
      {waitingLabel}
    </span>
  );
}
