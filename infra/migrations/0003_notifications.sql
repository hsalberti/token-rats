-- Phase 2 Track K: notification tables

CREATE TABLE push_subscriptions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  endpoint    TEXT NOT NULL,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  UNIQUE (user_id, endpoint),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE notification_prefs (
  user_id          TEXT PRIMARY KEY,
  weekly_digest    INTEGER NOT NULL DEFAULT 1,
  room_challenges  INTEGER NOT NULL DEFAULT 1,
  passed           INTEGER NOT NULL DEFAULT 1,
  updated_at       INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
