-- 0013_granular_token_usage.sql
--
-- 1. Relax sessions.source CHECK to allow 'codex' (was silently rejected).
-- 2. Add granular per-token-kind columns on `sessions`:
--      - provider          ('anthropic' | 'openai' | 'cursor' | 'unknown')
--      - cache_read_tokens  (Anthropic cache read; OpenAI cached_input)
--      - cache_write_tokens (Anthropic cache creation)
--      - reasoning_tokens   (OpenAI reasoning output, billed at output rate)
--    These are additive — `in_tokens`/`out_tokens` keep their existing meaning
--    so leaderboards continue to render the same headline numbers.
-- 3. Create `daily_rollup_by_model` so per-day aggregation no longer collapses
--    source/provider/model. Backfill from existing sessions.
--
-- SQLite can't drop a CHECK constraint in-place, so we follow the documented
-- 12-step pattern: rename → create new → copy → drop → rename → recreate indexes.

ALTER TABLE sessions RENAME TO sessions_old;

CREATE TABLE sessions (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL,
  source              TEXT NOT NULL CHECK (source IN ('claude-code','cursor','codex')),
  provider            TEXT NOT NULL DEFAULT 'unknown'
                      CHECK (provider IN ('anthropic','openai','cursor','unknown')),
  model               TEXT NOT NULL,
  in_tokens           INTEGER NOT NULL,
  out_tokens          INTEGER NOT NULL,
  cache_read_tokens   INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens  INTEGER NOT NULL DEFAULT 0,
  reasoning_tokens    INTEGER NOT NULL DEFAULT 0,
  cost_usd_cents      INTEGER NOT NULL,
  started_at          INTEGER NOT NULL,
  ended_at            INTEGER NOT NULL,
  dedupe_key          TEXT NOT NULL,
  UNIQUE (user_id, dedupe_key),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

INSERT INTO sessions (
  id, user_id, source, provider, model,
  in_tokens, out_tokens,
  cache_read_tokens, cache_write_tokens, reasoning_tokens,
  cost_usd_cents, started_at, ended_at, dedupe_key
)
SELECT
  id, user_id, source,
  CASE source
    WHEN 'claude-code' THEN 'anthropic'
    WHEN 'cursor'      THEN 'cursor'
    WHEN 'codex'       THEN 'openai'
    ELSE 'unknown'
  END,
  model,
  in_tokens, out_tokens,
  0, 0, 0,
  cost_usd_cents, started_at, ended_at, dedupe_key
FROM sessions_old;

DROP TABLE sessions_old;

CREATE INDEX idx_sessions_user_started  ON sessions(user_id, started_at DESC);
CREATE INDEX idx_sessions_user_provider ON sessions(user_id, provider);
CREATE INDEX idx_sessions_user_model    ON sessions(user_id, model);

-- Per-day, per-(source/provider/model) aggregation. Lives next to the legacy
-- `daily_rollup` so existing leaderboard queries keep working unchanged; new
-- analytics surfaces (model split, provider split, per-IDE breakdown) read
-- from this table instead.
CREATE TABLE daily_rollup_by_model (
  user_id             TEXT NOT NULL,
  day                 TEXT NOT NULL,  -- YYYY-MM-DD, UTC
  source              TEXT NOT NULL,
  provider            TEXT NOT NULL,
  model               TEXT NOT NULL,
  in_tokens           INTEGER NOT NULL DEFAULT 0,
  out_tokens          INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens   INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens  INTEGER NOT NULL DEFAULT 0,
  reasoning_tokens    INTEGER NOT NULL DEFAULT 0,
  cost_usd_cents      INTEGER NOT NULL DEFAULT 0,
  sessions            INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day, source, provider, model),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_drbm_user_day  ON daily_rollup_by_model(user_id, day);
CREATE INDEX idx_drbm_day       ON daily_rollup_by_model(day);
CREATE INDEX idx_drbm_provider  ON daily_rollup_by_model(provider);
CREATE INDEX idx_drbm_model     ON daily_rollup_by_model(model);

-- Backfill from sessions. `started_at` is ms-epoch; SQLite's `unixepoch`
-- modifier expects seconds, hence the divide.
INSERT INTO daily_rollup_by_model (
  user_id, day, source, provider, model,
  in_tokens, out_tokens,
  cache_read_tokens, cache_write_tokens, reasoning_tokens,
  cost_usd_cents, sessions
)
SELECT
  user_id,
  strftime('%Y-%m-%d', started_at / 1000, 'unixepoch') AS day,
  source,
  provider,
  model,
  SUM(in_tokens),
  SUM(out_tokens),
  SUM(cache_read_tokens),
  SUM(cache_write_tokens),
  SUM(reasoning_tokens),
  SUM(cost_usd_cents),
  COUNT(*)
FROM sessions
GROUP BY user_id, day, source, provider, model;
