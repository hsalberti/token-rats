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

interface DeviceBreakdownRow extends DeviceTotalsRow {
  value: string;
}

interface DeviceLatestRow {
  device_id: string | null;
  started_at: number;
}

function topNByDevice(
  rows: DeviceBreakdownRow[] | undefined,
  limit = 3,
): Map<string | null, DeviceBreakdownRow[]> {
  const out = new Map<string | null, DeviceBreakdownRow[]>();
  for (const row of rows ?? []) {
    const list = out.get(row.device_id) ?? [];
    if (list.length < limit) list.push(row);
    out.set(row.device_id, list);
  }
  return out;
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
  const totals30dRowsResult = await c.env.DB.prepare(
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

  const totalsAllTimeRowsResult = await c.env.DB.prepare(
    `SELECT device_id,
            COALESCE(SUM(in_tokens + out_tokens), 0) AS tokens,
            COALESCE(SUM(cost_usd_cents), 0)         AS cost_usd_cents,
            COUNT(*)                                  AS sessions
       FROM sessions
      WHERE user_id = ?
      GROUP BY device_id`,
  )
    .bind(userId)
    .all<DeviceTotalsRow>();

  const sourceRowsResult = await c.env.DB.prepare(
    `SELECT device_id,
            source AS value,
            COALESCE(SUM(in_tokens + out_tokens), 0) AS tokens,
            COALESCE(SUM(cost_usd_cents), 0)         AS cost_usd_cents,
            COUNT(*)                                  AS sessions
       FROM sessions
      WHERE user_id = ? AND started_at >= ?
      GROUP BY device_id, source
      ORDER BY device_id, tokens DESC`,
  )
    .bind(userId, thirtyDaysAgoMs)
    .all<DeviceBreakdownRow>();

  const providerRowsResult = await c.env.DB.prepare(
    `SELECT device_id,
            provider AS value,
            COALESCE(SUM(in_tokens + out_tokens), 0) AS tokens,
            COALESCE(SUM(cost_usd_cents), 0)         AS cost_usd_cents,
            COUNT(*)                                  AS sessions
       FROM sessions
      WHERE user_id = ? AND started_at >= ?
      GROUP BY device_id, provider
      ORDER BY device_id, tokens DESC`,
  )
    .bind(userId, thirtyDaysAgoMs)
    .all<DeviceBreakdownRow>();

  const clientRowsResult = await c.env.DB.prepare(
    `SELECT device_id,
            COALESCE(client, 'unknown') AS value,
            COALESCE(SUM(in_tokens + out_tokens), 0) AS tokens,
            COALESCE(SUM(cost_usd_cents), 0)         AS cost_usd_cents,
            COUNT(*)                                  AS sessions
       FROM sessions
      WHERE user_id = ? AND started_at >= ?
      GROUP BY device_id, COALESCE(client, 'unknown')
      ORDER BY device_id, tokens DESC`,
  )
    .bind(userId, thirtyDaysAgoMs)
    .all<DeviceBreakdownRow>();

  const channelRowsResult = await c.env.DB.prepare(
    `SELECT device_id,
            COALESCE(channel, 'unknown') AS value,
            COALESCE(SUM(in_tokens + out_tokens), 0) AS tokens,
            COALESCE(SUM(cost_usd_cents), 0)         AS cost_usd_cents,
            COUNT(*)                                  AS sessions
       FROM sessions
      WHERE user_id = ? AND started_at >= ?
      GROUP BY device_id, COALESCE(channel, 'unknown')
      ORDER BY device_id, tokens DESC`,
  )
    .bind(userId, thirtyDaysAgoMs)
    .all<DeviceBreakdownRow>();

  const modelRowsResult = await c.env.DB.prepare(
    `SELECT device_id,
            model AS value,
            COALESCE(SUM(in_tokens + out_tokens), 0) AS tokens,
            COALESCE(SUM(cost_usd_cents), 0)         AS cost_usd_cents,
            COUNT(*)                                  AS sessions
       FROM sessions
      WHERE user_id = ? AND started_at >= ?
      GROUP BY device_id, model
      ORDER BY device_id, tokens DESC`,
  )
    .bind(userId, thirtyDaysAgoMs)
    .all<DeviceBreakdownRow>();

  const latestRowsResult = await c.env.DB.prepare(
    `SELECT device_id, started_at
       FROM (
         SELECT device_id,
                started_at,
                ROW_NUMBER() OVER (
                  PARTITION BY COALESCE(device_id, '__legacy__')
                  ORDER BY started_at DESC
                ) AS rn
           FROM sessions
          WHERE user_id = ?
       )
      WHERE rn = 1`,
  )
    .bind(userId)
    .all<DeviceLatestRow>();

  const totals30dByDevice = new Map<string | null, DeviceTotalsRow>();
  for (const r of totals30dRowsResult.results ?? []) {
    totals30dByDevice.set(r.device_id, r);
  }

  const totalsAllTimeByDevice = new Map<string | null, DeviceTotalsRow>();
  for (const r of totalsAllTimeRowsResult.results ?? []) {
    totalsAllTimeByDevice.set(r.device_id, r);
  }

  const latestByDevice = new Map<string | null, number>();
  for (const r of latestRowsResult.results ?? []) {
    latestByDevice.set(r.device_id, r.started_at);
  }

  const topSourcesByDevice = topNByDevice(sourceRowsResult.results);
  const topClientsByDevice = topNByDevice(clientRowsResult.results);
  const topChannelsByDevice = topNByDevice(channelRowsResult.results);
  const topProvidersByDevice = topNByDevice(providerRowsResult.results);
  const topModelsByDevice = topNByDevice(modelRowsResult.results);

  const devicesOut = (deviceRowsResult.results ?? []).map((d) => {
    const t30 = totals30dByDevice.get(d.device_id);
    const tall = totalsAllTimeByDevice.get(d.device_id);
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
      isLegacy: false,
      lastSessionAt: latestByDevice.get(d.device_id) ?? null,
      totals: {
        tokens: t30?.tokens ?? 0,
        costUsdCents: t30?.cost_usd_cents ?? 0,
        sessions: t30?.sessions ?? 0,
      },
      totalsAllTime: {
        tokens: tall?.tokens ?? 0,
        costUsdCents: tall?.cost_usd_cents ?? 0,
        sessions: tall?.sessions ?? 0,
      },
      topSources: (topSourcesByDevice.get(d.device_id) ?? []).map((row) => ({
        value: row.value,
        tokens: row.tokens,
        costUsdCents: row.cost_usd_cents,
        sessions: row.sessions,
      })),
      topClients: (topClientsByDevice.get(d.device_id) ?? []).map((row) => ({
        value: row.value,
        tokens: row.tokens,
        costUsdCents: row.cost_usd_cents,
        sessions: row.sessions,
      })),
      topChannels: (topChannelsByDevice.get(d.device_id) ?? []).map((row) => ({
        value: row.value,
        tokens: row.tokens,
        costUsdCents: row.cost_usd_cents,
        sessions: row.sessions,
      })),
      topProviders: (topProvidersByDevice.get(d.device_id) ?? []).map((row) => ({
        value: row.value,
        tokens: row.tokens,
        costUsdCents: row.cost_usd_cents,
        sessions: row.sessions,
      })),
      topModels: (topModelsByDevice.get(d.device_id) ?? []).map((row) => ({
        value: row.value,
        tokens: row.tokens,
        costUsdCents: row.cost_usd_cents,
        sessions: row.sessions,
      })),
    };
  });

  // Synthesize a "legacy" pseudo-device for pre-0017 sessions with NULL device_id.
  const legacyAllTime = totalsAllTimeByDevice.get(null);
  const legacy30d = totals30dByDevice.get(null);
  if (legacyAllTime && legacyAllTime.sessions > 0) {
    devicesOut.push({
      deviceId: "legacy",
      createdAt: 0,
      lastSeenAt: 0,
      lastHeartbeatAt: null,
      isLive: false,
      lastUploadCount: 0,
      cliVersion: null,
      revokedAt: null,
      isLegacy: true,
      lastSessionAt: latestByDevice.get(null) ?? null,
      totals: {
        tokens: legacy30d?.tokens ?? 0,
        costUsdCents: legacy30d?.cost_usd_cents ?? 0,
        sessions: legacy30d?.sessions ?? 0,
      },
      totalsAllTime: {
        tokens: legacyAllTime.tokens,
        costUsdCents: legacyAllTime.cost_usd_cents,
        sessions: legacyAllTime.sessions,
      },
      topSources: (topSourcesByDevice.get(null) ?? []).map((row) => ({
        value: row.value,
        tokens: row.tokens,
        costUsdCents: row.cost_usd_cents,
        sessions: row.sessions,
      })),
      topClients: (topClientsByDevice.get(null) ?? []).map((row) => ({
        value: row.value,
        tokens: row.tokens,
        costUsdCents: row.cost_usd_cents,
        sessions: row.sessions,
      })),
      topChannels: (topChannelsByDevice.get(null) ?? []).map((row) => ({
        value: row.value,
        tokens: row.tokens,
        costUsdCents: row.cost_usd_cents,
        sessions: row.sessions,
      })),
      topProviders: (topProvidersByDevice.get(null) ?? []).map((row) => ({
        value: row.value,
        tokens: row.tokens,
        costUsdCents: row.cost_usd_cents,
        sessions: row.sessions,
      })),
      topModels: (topModelsByDevice.get(null) ?? []).map((row) => ({
        value: row.value,
        tokens: row.tokens,
        costUsdCents: row.cost_usd_cents,
        sessions: row.sessions,
      })),
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
