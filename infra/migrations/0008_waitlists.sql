-- v1.2 Track AA + v1.1 Track X: waitlists
-- Shared backend for org waitlist ('orgs') and provider waitlist ('provider:<id>').
-- Idempotent on (topic, email).

CREATE TABLE waitlists (
  id            TEXT PRIMARY KEY,
  topic         TEXT NOT NULL,
  email         TEXT NOT NULL,
  github_login  TEXT,
  payload_json  TEXT,
  created_at    INTEGER NOT NULL,
  UNIQUE (topic, email)
);

CREATE INDEX idx_waitlists_topic_created ON waitlists(topic, created_at);
