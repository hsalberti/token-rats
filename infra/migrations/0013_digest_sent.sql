-- v1.2 Track AB: idempotency for the weekly digest cron.
-- last_digest_sent_at is the Unix-ms timestamp of the last successful send.
-- The cron uses this to skip users we already mailed inside the current ISO week,
-- so a re-triggered run (manual or retry) doesn't double-send.

ALTER TABLE notification_prefs ADD COLUMN last_digest_sent_at INTEGER;
