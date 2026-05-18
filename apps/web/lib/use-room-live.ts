/**
 * useRoomLive — opens an EventSource to GET /v1/rooms/:code/live and yields
 * parsed LiveEvents to the component.
 *
 * The hook reconnects automatically on connection loss (EventSource does this
 * natively). It tears down the connection on unmount.
 */

"use client";

import { useEffect, useRef } from "react";
import type { LiveEvent } from "@token-rats/contracts";
import { LiveEvent as LiveEventSchema } from "@token-rats/contracts";
import { API_URL } from "./api";
import { ENDPOINTS } from "@token-rats/contracts";
import type { RoomCode } from "@token-rats/contracts";

export type LiveEventHandler = (event: LiveEvent) => void;

/**
 * Subscribe to live SSE events for a room.
 *
 * @param code     Room code to subscribe to.
 * @param onEvent  Callback invoked for every parsed LiveEvent.
 */
export function useRoomLive(code: RoomCode, onEvent: LiveEventHandler): void {
  // Keep a stable ref to the callback so the effect doesn't re-run on every render
  const onEventRef = useRef<LiveEventHandler>(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    const url = `${API_URL}${ENDPOINTS.roomLive(code)}`;
    const es = new EventSource(url, { withCredentials: true });

    function handleMessage(eventKind: string, rawData: string): void {
      try {
        const payload: unknown = JSON.parse(rawData);
        const parsed = LiveEventSchema.safeParse({ kind: eventKind, payload });
        if (parsed.success) {
          onEventRef.current(parsed.data);
        }
      } catch {
        // Malformed data — ignore
      }
    }

    // The server sends named events (event: leaderboard-update / session-added)
    const leaderboardListener = (e: MessageEvent) => {
      handleMessage("leaderboard-update", e.data as string);
    };
    const sessionListener = (e: MessageEvent) => {
      handleMessage("session-added", e.data as string);
    };

    es.addEventListener("leaderboard-update", leaderboardListener);
    es.addEventListener("session-added", sessionListener);

    return () => {
      es.removeEventListener("leaderboard-update", leaderboardListener);
      es.removeEventListener("session-added", sessionListener);
      es.close();
    };
  }, [code]);
}
