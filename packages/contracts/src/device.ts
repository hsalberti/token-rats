import { z } from "zod";

/**
 * Anonymized device record. The server intentionally does NOT carry any
 * identifying metadata (hostname / OS / labels) — those are stored locally on
 * the device in `~/.config/token-rats/devices.json` and merged client-side at
 * render time. See `roadmap.md` "Locked product decisions" for the privacy
 * commitment.
 */
export const Device = z.object({
  deviceId: z.string().min(1),
  createdAt: z.number().int().nonnegative(),
  lastSeenAt: z.number().int().nonnegative(),
  lastHeartbeatAt: z.number().int().nonnegative().nullable(),
  /** Derived: true iff lastHeartbeatAt is within 5 min of `now`. */
  isLive: z.boolean(),
  lastUploadCount: z.number().int().nonnegative(),
  cliVersion: z.string().nullable(),
  /** Unix-ms when the user revoked this device via the web UI, else null. */
  revokedAt: z.number().int().nonnegative().nullable(),
  /** 30-day totals for this device, computed at request time. */
  totals: z.object({
    tokens: z.number().int().nonnegative(),
    costUsdCents: z.number().int().nonnegative(),
    sessions: z.number().int().nonnegative(),
  }),
});
export type Device = z.infer<typeof Device>;

/** Response shape for `GET /v1/me/devices`. */
export const GetMeDevicesResponse = z.object({
  devices: z.array(Device),
});
export type GetMeDevicesResponse = z.infer<typeof GetMeDevicesResponse>;

/** Response shape for `POST /v1/me/devices/:deviceId/revoke`. */
export const RevokeDeviceResponse = z.object({
  ok: z.literal(true),
  revokedAt: z.number().int().nonnegative(),
});
export type RevokeDeviceResponse = z.infer<typeof RevokeDeviceResponse>;

/** Response shape for `POST /v1/me/devices/heartbeat`. */
export const DeviceHeartbeatResponse = z.object({
  ok: z.literal(true),
  lastHeartbeatAt: z.number().int().nonnegative(),
});
export type DeviceHeartbeatResponse = z.infer<typeof DeviceHeartbeatResponse>;
