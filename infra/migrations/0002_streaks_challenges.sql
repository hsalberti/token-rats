-- Token Rats Phase 2 — Streaks & Challenges migration
-- Adds the `challenges` table for weekly room challenges.
-- Streaks are computed on-demand from daily_rollup; no new table needed.

CREATE TABLE challenges (
  id         TEXT PRIMARY KEY,
  room_id    TEXT NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('most-tokens','longest-streak','most-sessions')),
  starts_at  INTEGER NOT NULL,
  ends_at    INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (room_id) REFERENCES rooms(id)
);

CREATE INDEX idx_challenges_room_window ON challenges(room_id, ends_at);
