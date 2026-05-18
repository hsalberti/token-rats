/**
 * Live event schemas for SSE / Durable Object fan-out.
 * Used by the API (RoomLiveHub) and the web client (useRoomLive).
 */
import { z } from "zod";

/* -------------------------------------------------------------------------- */
/* Individual event payloads                                                   */
/* -------------------------------------------------------------------------- */

export const LeaderboardUpdatePayload = z.object({
  roomCode: z.string(),
});
export type LeaderboardUpdatePayload = z.infer<typeof LeaderboardUpdatePayload>;

export const SessionAddedPayload = z.object({
  roomCode: z.string(),
  handle: z.string(),
  tokens: z.number().int().nonnegative(),
  costUsdCents: z.number().int().nonnegative(),
});
export type SessionAddedPayload = z.infer<typeof SessionAddedPayload>;

/* -------------------------------------------------------------------------- */
/* Discriminated union                                                         */
/* -------------------------------------------------------------------------- */

export const LiveEvent = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("leaderboard-update"),
    payload: LeaderboardUpdatePayload,
  }),
  z.object({
    kind: z.literal("session-added"),
    payload: SessionAddedPayload,
  }),
]);
export type LiveEvent = z.infer<typeof LiveEvent>;
