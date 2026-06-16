-- 0021_notification_milestones.sql
--
-- Dedupe ledger for one-shot "milestone" web-push notifications fired on
-- ingest (see apps/api/src/lib/milestone-notify.ts). One row per
-- (user, milestone) — the presence of a row means that milestone push has
-- already been delivered (or attempted) for that user, so a later ingest in
-- the same window never re-sends. Keeps the on-ingest notification bounded to
-- at most one push per never-before-crossed threshold.

CREATE TABLE notification_milestones (
  user_id      TEXT NOT NULL,
  -- Lifetime-token threshold that was crossed, e.g. 1000000.
  milestone    INTEGER NOT NULL,
  sent_at      INTEGER NOT NULL,
  PRIMARY KEY (user_id, milestone),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
