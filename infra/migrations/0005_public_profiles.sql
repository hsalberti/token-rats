-- Migration 0005: Public profiles + global discovery (Phase 3 Track N)
ALTER TABLE users ADD COLUMN public_profile INTEGER NOT NULL DEFAULT 0;  -- 0 = private, 1 = public
ALTER TABLE users ADD COLUMN bio TEXT;
ALTER TABLE users ADD COLUMN twitter_handle TEXT;
CREATE INDEX idx_users_public ON users(public_profile) WHERE public_profile = 1;

-- Abuse reports table (stub — full moderation pipeline is out of scope)
CREATE TABLE IF NOT EXISTS reports (
  id          TEXT    PRIMARY KEY,
  reporter_id TEXT    NOT NULL,
  target_handle TEXT  NOT NULL,
  reason      TEXT    NOT NULL,
  created_at  INTEGER NOT NULL
);
