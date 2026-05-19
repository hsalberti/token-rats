-- Migration 0013: per-signup channel attribution (UTM tags).
--
-- Captures `utm_source`, `utm_medium`, `utm_campaign` query params at GitHub
-- OAuth start time, then persists them on the user's row at signup. Read-only
-- after that — revisits never overwrite the original tags. Joined with the
-- existing `referrals` table this gives us "where did this signup come from"
-- per user, separate from "who referred them".

ALTER TABLE users ADD COLUMN signup_source TEXT;
ALTER TABLE users ADD COLUMN signup_medium TEXT;
ALTER TABLE users ADD COLUMN signup_campaign TEXT;

-- Index only `signup_source` — that's what an admin breakdown groups by.
-- Medium and campaign are auxiliary; full-table scans of a launch-sized
-- users table are fine and avoid two extra writes per signup.
CREATE INDEX idx_users_signup_source ON users(signup_source)
  WHERE signup_source IS NOT NULL;
