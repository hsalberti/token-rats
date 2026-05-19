-- Pinned room — one room per user surfaces a top-5+me leaderboard preview
-- on /app. Default 0 keeps every existing membership unpinned; the backfill
-- below seeds each existing user's most-recently-joined membership as their
-- pin so they don't have to discover the star icon to see the card. A
-- partial UNIQUE index enforces at most one pinned row per user — so the
-- server can update `is_pinned` freely without managing a separate "current
-- pin" pointer.

ALTER TABLE room_members ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0;

-- Backfill: for each user, pin their most-recently-joined membership. New
-- users that join after this migration runs are auto-pinned in
-- `apps/api/src/routes/rooms.ts` (autoPinIfNone), so this only catches the
-- pre-migration cohort.
-- For each distinct user_id, pick exactly one row (the latest joined_at,
-- with rowid as a deterministic tiebreaker) and pin it. The strict single-
-- row-per-user shape is what lets the partial UNIQUE index below succeed.
UPDATE room_members
   SET is_pinned = 1
 WHERE rowid IN (
   SELECT rowid
     FROM room_members rm
    WHERE rowid = (
      SELECT rowid
        FROM room_members rm2
       WHERE rm2.user_id = rm.user_id
       ORDER BY rm2.joined_at DESC, rm2.rowid DESC
       LIMIT 1
    )
 );

CREATE UNIQUE INDEX idx_room_members_one_pin_per_user
  ON room_members(user_id)
  WHERE is_pinned = 1;
