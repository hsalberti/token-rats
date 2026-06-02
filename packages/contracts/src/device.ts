import { z } from "zod";

/**
 * Anonymized device record. The server intentionally does NOT carry any
 * identifying metadata (hostname / OS / labels) — those are stored locally on
 * the device in `~/.config/token-rats/devices.json` and merged client-side at
 * render time. See `roadmap.md` "Locked product decisions" for the privacy
 * commitment.
 */
export const DeviceTotals = z.object({
  tokens: z.number().int().nonnegative(),
  costUsdCents: z.number().int().nonnegative(),
  sessions: z.number().int().nonnegative(),
});
export type DeviceTotals = z.infer<typeof DeviceTotals>;

/** Generic ranked breakdown entry for a device's recent activity. */
export const DeviceBreakdownEntry = z.object({
  value: z.string().min(1),
  tokens: z.number().int().nonnegative(),
  costUsdCents: z.number().int().nonnegative(),
  sessions: z.number().int().nonnegative(),
});
export type DeviceBreakdownEntry = z.infer<typeof DeviceBreakdownEntry>;

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
  /** True for the synthetic pre-device-id bucket. */
  isLegacy: z.boolean().default(false),
  /** Last observed session upload timestamp for this device, if any. */
  lastSessionAt: z.number().int().nonnegative().nullable(),
  /** 30-day totals for this device, computed at request time. */
  totals: DeviceTotals,
  /** All-time totals for this device. */
  totalsAllTime: DeviceTotals,
  /** Dominant sources in the last 30 days, ordered by tokens desc. */
  topSources: z.array(DeviceBreakdownEntry).max(3).default([]),
  /** Dominant clients/tools in the last 30 days, ordered by tokens desc. */
  topClients: z.array(DeviceBreakdownEntry).max(3).default([]),
  /** Dominant transport channels in the last 30 days, ordered by tokens desc. */
  topChannels: z.array(DeviceBreakdownEntry).max(3).default([]),
  /** Dominant providers in the last 30 days, ordered by tokens desc. */
  topProviders: z.array(DeviceBreakdownEntry).max(3).default([]),
  /** Dominant models in the last 30 days, ordered by tokens desc. */
  topModels: z.array(DeviceBreakdownEntry).max(3).default([]),
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
