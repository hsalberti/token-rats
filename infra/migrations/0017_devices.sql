-- 0017_devices.sql
--
-- Adds the `devices` table and a nullable `sessions.device_id` column to
-- enable the anonymized multi-device view + remote-disconnect flow.
--
-- Privacy posture (locked in roadmap.md): the server stores NO hostname,
-- NO OS string, and NO identifying metadata per device. Only an opaque
-- `device_id` (a UUID the CLI generates locally), the owning user_id,
-- timestamps, upload counters, the cli_version that posted last, and the
-- revoked_at sentinel. Friendly device names live exclusively in the CLI's
-- `~/.config/token-rats/devices.json` and are merged with the anonymized
-- list client-side at render time.

CREATE TABLE devices (
  device_id            TEXT PRIMARY KEY,
  user_id              TEXT NOT NULL,
  created_at           INTEGER NOT NULL,
  last_seen_at         INTEGER NOT NULL,
  last_heartbeat_at    INTEGER,
  last_upload_count    INTEGER NOT NULL DEFAULT 0,
  cli_version          TEXT,
  revoked_at           INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_devices_user_lastseen ON devices(user_id, last_seen_at DESC);

-- Add the device dimension to sessions. Nullable so pre-0017 CLI clients
-- (and any backfill of legacy data) continue to ingest with device_id=NULL.
-- The `/v1/me/devices` UI shows those rows under a single "Legacy device"
-- aggregate row.
ALTER TABLE sessions ADD COLUMN device_id TEXT;

CREATE INDEX idx_sessions_user_device ON sessions(user_id, device_id);
