-- v1.2 Track AF: source plan tier for the primary-source pill.
-- Parsers fill this from the strongest local signal (OAuth token presence vs raw API key,
-- account-tier hints in logs, Cursor plan flag, Codex CLI auth mode).
-- Nullable: existing rows degrade to "unknown".
-- Vocab: 'pro' | 'max' | 'api' | 'ide' | 'unknown'.

ALTER TABLE sessions ADD COLUMN source_plan TEXT;
CREATE INDEX idx_sessions_user_source_started ON sessions(user_id, source, started_at);
