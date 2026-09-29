ALTER TABLE setup_versions ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private' CHECK(visibility IN ('private','friends','public'));
ALTER TABLE setup_versions ADD COLUMN automatic INTEGER NOT NULL DEFAULT 0;
UPDATE setup_versions SET visibility='public' WHERE published_at IS NOT NULL;
CREATE TABLE setup_kudos (
  user_id TEXT NOT NULL REFERENCES users(id),
  version_id TEXT NOT NULL REFERENCES setup_versions(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(user_id,version_id)
);
CREATE INDEX setup_kudos_version ON setup_kudos(version_id);
CREATE TABLE setup_watchers (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  setup_id TEXT NOT NULL UNIQUE REFERENCES setups(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL, label TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  content_hash TEXT NOT NULL DEFAULT '',
  last_seen_at INTEGER NOT NULL, last_change_at INTEGER,
  error TEXT, created_at INTEGER NOT NULL
);
CREATE INDEX setup_watchers_owner ON setup_watchers(user_id);
