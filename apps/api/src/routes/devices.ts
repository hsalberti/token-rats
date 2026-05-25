/**
 * Devices — anonymized multi-device routes mounted on `/v1/me`.
 *
 *   GET  /v1/me/devices                       — list the caller's devices
 *   POST /v1/me/devices/heartbeat             — liveness ping from the daemon
 *   POST /v1/me/devices/:deviceId/revoke      — disconnect a device
 *
 * Privacy posture: the server stores no hostname / OS / labels. Only an
 * opaque `device_id`, the owning `user_id`, timestamps, upload counters, and
 * `cli_version`. Friendly labels live client-side in
 * `~/.config/token-rats/devices.json`.
 */

import { Hono } from "hono";
import type { Env } from "../env.js";
import { notFound } from "../lib/errors.js";
import type { AuthVariables } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";

type HonoEnv = { Bindings: Env; Variables: AuthVariables };

const devices = new Hono<HonoEnv>();

/** A device is "live" if its last heartbeat was within this many milliseconds. */
const LIVE_HEARTBEAT_WINDOW_MS = 5 * 60 * 1000;

interface DeviceRow {
  device_id: string;
  created_at: number;
  last_seen_at: number;
  last_heartbeat_at: number | null;
  last_upload_count: number;
  cli_version: string | null;
  revoked_at: number | null;
}

interface DeviceTotalsRow {
  device_id: string | null;
  tokens: number;
  cost_usd_cents: number;
  sessions: number;
}

/* -------------------------------------------------------------------------- */
/* GET /v1/me/devices                                                          */
/* -------------------------------------------------------------------------- */

devices.get("/devices", requireAuth, async (c) => {
  const userId = c.var.userId;
  const now = Date.now();

  const deviceRowsResult = await c.env.DB.prepare(
    `SELECT device_id, created_at, last_seen_at, last_heartbeat_at,
            last_upload_count, cli_version, revoked_at
       FROM devices
      WHERE user_id = ?
      ORDER BY last_seen_at DESC`,
  )
    .bind(userId)
    .all<DeviceRow>();

  // 30-day per-device totals from `sessions`. Includes a NULL-device row for
  // legacy sessions (pre-0017 CLIs).
  const thirtyDaysAgoMs = now - 30 * 24 * 3600 * 1000;
  const totalsRowsResult = await c.env.DB.prepare(
    `SELECT device_id,
            COALESCE(SUM(in_tokens + out_tokens), 0) AS tokens,
            COALESCE(SUM(cost_usd_cents), 0)         AS cost_usd_cents,
            COUNT(*)                                  AS sessions
       FROM sessions
      WHERE user_id = ? AND started_at >= ?
      GROUP BY device_id`,
  )
    .bind(userId, thirtyDaysAgoMs)
    .all<DeviceTotalsRow>();

  const totalsByDevice = new Map<string | null, DeviceTotalsRow>();
  for (const r of totalsRowsResult.results ?? []) {
    totalsByDevice.set(r.device_id, r);
  }

  const devicesOut = (deviceRowsResult.results ?? []).map((d) => {
    const t = totalsByDevice.get(d.device_id);
    const isLive =
      d.revoked_at === null &&
      d.last_heartbeat_at !== null &&
      now - d.last_heartbeat_at <= LIVE_HEARTBEAT_WINDOW_MS;
    return {
      deviceId: d.device_id,
      createdAt: d.created_at,
      lastSeenAt: d.last_seen_at,
      lastHeartbeatAt: d.last_heartbeat_at,
      isLive,
      lastUploadCount: d.last_upload_count,
      cliVersion: d.cli_version,
      revokedAt: d.revoked_at,
      totals: {
        tokens: t?.tokens ?? 0,
        costUsdCents: t?.cost_usd_cents ?? 0,
        sessions: t?.sessions ?? 0,
      },
    };
  });

  // Synthesize a "legacy" pseudo-device for pre-0017 sessions with NULL device_id.
  const legacy = totalsByDevice.get(null);
  if (legacy && legacy.sessions > 0) {
    devicesOut.push({
      deviceId: "legacy",
      createdAt: 0,
      lastSeenAt: 0,
      lastHeartbeatAt: null,
      isLive: false,
      lastUploadCount: 0,
      cliVersion: null,
      revokedAt: null,
      totals: {
        tokens: legacy.tokens,
        costUsdCents: legacy.cost_usd_cents,
        sessions: legacy.sessions,
      },
    });
  }

  return c.json({ devices: devicesOut });
});

/* -------------------------------------------------------------------------- */
/* POST /v1/me/devices/heartbeat                                               */
/* -------------------------------------------------------------------------- */

devices.post("/devices/heartbeat", requireAuth, async (c) => {
  const userId = c.var.userId;
  const deviceIdHeader = c.req.header("X-Device-Id");
  if (!deviceIdHeader || !/^[A-Za-z0-9_-]{8,128}$/.test(deviceIdHeader)) {
    return c.json({ error: "missing_device_id" }, 400);
  }
  const cliVersion = c.req.header("X-Cli-Version") ?? null;

  // Look up the device. If it doesn't exist yet, the daemon will pick it up on
  // the first session upload; until then, return 404 to avoid creating a
  // device row with zero uploads.
  const row = await c.env.DB.prepare("SELECT user_id, revoked_at FROM devices WHERE device_id = ?")
    .bind(deviceIdHeader)
    .first<{ user_id: string; revoked_at: number | null }>();

  if (!row || row.user_id !== userId) {
    return c.json({ error: "device_not_found" }, 404);
  }
  if (row.revoked_at !== null) {
    return c.json({ error: "device_revoked" }, 401);
  }

  const now = Date.now();
  await c.env.DB.prepare(
    `UPDATE devices
        SET last_heartbeat_at = ?,
            cli_version       = COALESCE(?, cli_version)
      WHERE device_id = ?`,
  )
    .bind(now, cliVersion, deviceIdHeader)
    .run();

  return c.json({ ok: true, lastHeartbeatAt: now });
});

/* -------------------------------------------------------------------------- */
/* POST /v1/me/devices/:deviceId/revoke                                        */
/* -------------------------------------------------------------------------- */

devices.post("/devices/:deviceId/revoke", requireAuth, async (c) => {
  const userId = c.var.userId;
  const deviceId = c.req.param("deviceId");

  const row = await c.env.DB.prepare("SELECT user_id, revoked_at FROM devices WHERE device_id = ?")
    .bind(deviceId)
    .first<{ user_id: string; revoked_at: number | null }>();

  if (!row || row.user_id !== userId) {
    return notFound(c, "Device not found");
  }

  // Already revoked → idempotent success.
  if (row.revoked_at !== null) {
    return c.json({ ok: true, revokedAt: row.revoked_at });
  }

  const now = Date.now();
  await c.env.DB.prepare("UPDATE devices SET revoked_at = ? WHERE device_id = ?")
    .bind(now, deviceId)
    .run();

  return c.json({ ok: true, revokedAt: now });
});

export default devices;
