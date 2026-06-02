-- 0019_session_attribution.sql
--
-- Adds first-class tool + transport attribution to raw sessions so we can
-- distinguish the coarse "source bucket" (claude-code / cursor / codex) from
-- the client surface that emitted the usage and the channel it traveled over.
--
-- Examples:
--   source='codex', provider='openai',   client='codex-cli',       channel='cli'
--   source='claude-code', provider='anthropic', client='claude-code', channel='cli'
--   source='claude-code', provider='anthropic', client='token-rats-proxy', channel='proxy'
--
-- Historical rows are backfilled from the old source-only worldview.

ALTER TABLE sessions ADD COLUMN client TEXT;
ALTER TABLE sessions ADD COLUMN channel TEXT;

UPDATE sessions
   SET client = CASE source
                  WHEN 'claude-code' THEN 'claude-code'
                  WHEN 'codex'       THEN 'codex-cli'
                  WHEN 'cursor'      THEN 'cursor'
                  ELSE 'unknown'
                END
 WHERE client IS NULL;

UPDATE sessions
   SET channel = CASE source
                   WHEN 'claude-code' THEN 'cli'
                   WHEN 'codex'       THEN 'cli'
                   WHEN 'cursor'      THEN 'ide'
                   ELSE 'unknown'
                 END
 WHERE channel IS NULL;

CREATE INDEX idx_sessions_user_client ON sessions(user_id, client);
CREATE INDEX idx_sessions_user_channel ON sessions(user_id, channel);
