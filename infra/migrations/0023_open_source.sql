-- Cache prices are nullable: missing rates are unknown, not free.
ALTER TABLE model_price_snapshots ADD COLUMN cache_read_per_mtok REAL;
ALTER TABLE model_price_snapshots ADD COLUMN cache_write_per_mtok REAL;

CREATE TABLE subscription_spend (
  user_id TEXT NOT NULL REFERENCES users(id),
  month TEXT NOT NULL,
  source TEXT NOT NULL,
  label TEXT NOT NULL,
  paid_usd_cents INTEGER NOT NULL CHECK (paid_usd_cents >= 0),
  PRIMARY KEY (user_id, month, source)
);

CREATE TABLE community_posts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('idea', 'agents-md', 'showcase', 'question')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_community_posts_created ON community_posts(created_at DESC, id);
CREATE TABLE community_replies (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_community_replies_post ON community_replies(post_id, created_at, id);

CREATE TABLE user_proxy_keys (
  user_id TEXT NOT NULL REFERENCES users(id),
  provider TEXT NOT NULL CHECK (provider IN ('openrouter', 'openai')),
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, provider)
);

-- Rebuild to extend the source/provider CHECK constraints.
CREATE TABLE sessions_next (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  source TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'unknown',
  model TEXT NOT NULL,
  in_tokens INTEGER NOT NULL,
  out_tokens INTEGER NOT NULL,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  reasoning_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd_cents INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER NOT NULL,
  dedupe_key TEXT NOT NULL,
  device_id TEXT,
  client TEXT,
  channel TEXT,
  UNIQUE (user_id, dedupe_key)
);
INSERT INTO sessions_next SELECT id, user_id, source, provider, model, in_tokens, out_tokens,
  cache_read_tokens, cache_write_tokens, reasoning_tokens, cost_usd_cents,
  started_at, ended_at, dedupe_key, device_id, client, channel FROM sessions;
DROP TABLE sessions;
ALTER TABLE sessions_next RENAME TO sessions;
CREATE INDEX idx_sessions_user_started ON sessions(user_id, started_at DESC);
CREATE INDEX idx_sessions_user_provider ON sessions(user_id, provider);
CREATE INDEX idx_sessions_user_model ON sessions(user_id, model);
CREATE INDEX idx_sessions_user_client ON sessions(user_id, client);
CREATE INDEX idx_sessions_user_channel ON sessions(user_id, channel);
CREATE INDEX idx_sessions_device ON sessions(device_id);
