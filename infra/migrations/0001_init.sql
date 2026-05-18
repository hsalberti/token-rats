-- Token Rats v1 schema (frozen at Phase 0; later phases append migrations).

CREATE TABLE users (
  id          TEXT PRIMARY KEY,
  github_id   INTEGER UNIQUE NOT NULL,
  handle      TEXT UNIQUE NOT NULL,
  avatar_url  TEXT,
  created_at  INTEGER NOT NULL
);

CREATE TABLE orgs (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE org_members (
  org_id  TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role    TEXT NOT NULL CHECK (role IN ('owner','admin','member')),
  PRIMARY KEY (org_id, user_id),
  FOREIGN KEY (org_id)  REFERENCES orgs(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE rooms (
  id         TEXT PRIMARY KEY,
  code       TEXT UNIQUE NOT NULL,
  name       TEXT NOT NULL,
  owner_id   TEXT NOT NULL,
  org_id     TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (owner_id) REFERENCES users(id),
  FOREIGN KEY (org_id)   REFERENCES orgs(id)
);

CREATE TABLE room_members (
  room_id   TEXT NOT NULL,
  user_id   TEXT NOT NULL,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (room_id, user_id),
  FOREIGN KEY (room_id) REFERENCES rooms(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE sessions (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL,
  source         TEXT NOT NULL CHECK (source IN ('claude-code','cursor')),
  model          TEXT NOT NULL,
  in_tokens      INTEGER NOT NULL,
  out_tokens     INTEGER NOT NULL,
  cost_usd_cents INTEGER NOT NULL,
  started_at     INTEGER NOT NULL,
  ended_at       INTEGER NOT NULL,
  dedupe_key     TEXT NOT NULL,
  UNIQUE (user_id, dedupe_key),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX idx_sessions_user_started ON sessions(user_id, started_at DESC);

CREATE TABLE daily_rollup (
  user_id        TEXT NOT NULL,
  day            TEXT NOT NULL,            -- YYYY-MM-DD, UTC
  tokens         INTEGER NOT NULL DEFAULT 0,
  cost_usd_cents INTEGER NOT NULL DEFAULT 0,
  sessions       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX idx_daily_rollup_day ON daily_rollup(day);
