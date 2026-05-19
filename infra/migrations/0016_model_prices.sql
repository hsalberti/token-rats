-- Migration 0015: time-versioned model catalog + daily price snapshots.
--
-- Replaces the static packages/pricing/prices.ts hand-curated table with a D1-
-- backed source of truth that the daily cron refreshes from OpenRouter (and
-- direct Anthropic/OpenAI APIs). Two tables:
--
--   models_catalog          — one row per known model. Provider, family, modality,
--                             activity flags. Append-mostly: new rows are added
--                             when a model first appears, is_active is flipped
--                             when it disappears for 7+ days.
--
--   model_price_snapshots   — one row per (model_id, day) with the input/output
--                             $/MTok captured that day. Primary key keeps the
--                             cron idempotent if it runs twice on the same day.
--                             Carry-forward lookup: "what did model X cost on
--                             day D" = most recent row with day <= D.
--
-- The seed inserts mirror the current contents of packages/pricing/src/prices.ts
-- as of 2026-05-18 so the server has prices to charge against day 1, before the
-- cron has had a chance to run. The cron will append a fresh snapshot the next
-- morning under source='openrouter'.

CREATE TABLE models_catalog (
  id              TEXT PRIMARY KEY,         -- canonical bare ID (e.g. 'claude-opus-4-7')
  provider        TEXT NOT NULL,            -- 'anthropic' | 'openai' | 'mistral' | …
  family          TEXT,                     -- prefix root for longest-prefix match
  display_name    TEXT,                     -- human-readable label from upstream
  modality        TEXT,                     -- 'text' | 'multimodal' | 'image' | 'audio' | 'embedding'
  context_window  INTEGER,
  is_active       INTEGER NOT NULL DEFAULT 1,
  first_seen_day  TEXT NOT NULL,            -- YYYY-MM-DD UTC
  last_seen_day   TEXT NOT NULL,
  source          TEXT NOT NULL,            -- 'openrouter' | 'anthropic-api' | 'openai-api' | 'manual-seed' | 'session-inferred'
  source_id       TEXT,                     -- upstream's ID (e.g. 'anthropic/claude-opus-4.5')
  notes           TEXT
);

CREATE INDEX idx_models_catalog_provider ON models_catalog(provider);
CREATE INDEX idx_models_catalog_family   ON models_catalog(family);
CREATE INDEX idx_models_catalog_active   ON models_catalog(is_active);

CREATE TABLE model_price_snapshots (
  day              TEXT NOT NULL,           -- YYYY-MM-DD UTC
  model_id         TEXT NOT NULL,
  input_per_mtok   REAL NOT NULL,
  output_per_mtok  REAL,                    -- nullable: embeddings/image have no output rate
  source           TEXT NOT NULL,
  fetched_at       INTEGER NOT NULL,        -- epoch ms when the cron captured this
  PRIMARY KEY (day, model_id),
  FOREIGN KEY (model_id) REFERENCES models_catalog(id)
);

CREATE INDEX idx_price_snapshots_model_day ON model_price_snapshots(model_id, day DESC);

-- ── Seed: catalog + day-of-migration snapshot from prices.ts (2026-05-18) ────
--
-- Two-step per row:
--   1. INSERT into models_catalog with source='manual-seed'.
--   2. INSERT today's price into model_price_snapshots.
--
-- `DATE('now')` returns YYYY-MM-DD in UTC at migration time. The cron's first
-- run the following day appends a 'openrouter' row on top — both rows coexist;
-- carry-forward lookup picks the latest day.

-- Anthropic / Claude
INSERT INTO models_catalog (id, provider, family, display_name, modality, is_active, first_seen_day, last_seen_day, source) VALUES
  ('claude-opus-4-7',             'anthropic', 'claude-opus-4',   'Claude Opus 4.7',    'multimodal', 1, DATE('now'), DATE('now'), 'manual-seed'),
  ('claude-opus-4-6',             'anthropic', 'claude-opus-4',   'Claude Opus 4.6',    'multimodal', 1, DATE('now'), DATE('now'), 'manual-seed'),
  ('claude-sonnet-4-6',           'anthropic', 'claude-sonnet-4', 'Claude Sonnet 4.6',  'multimodal', 1, DATE('now'), DATE('now'), 'manual-seed'),
  ('claude-sonnet-4-5',           'anthropic', 'claude-sonnet-4', 'Claude Sonnet 4.5',  'multimodal', 1, DATE('now'), DATE('now'), 'manual-seed'),
  ('claude-haiku-4-5',            'anthropic', 'claude-haiku-4',  'Claude Haiku 4.5',   'multimodal', 1, DATE('now'), DATE('now'), 'manual-seed'),
  ('claude-3-5-sonnet-20241022',  'anthropic', 'claude-3-5-sonnet', 'Claude 3.5 Sonnet (2024-10)', 'multimodal', 1, DATE('now'), DATE('now'), 'manual-seed'),
  ('claude-3-5-sonnet-20240620',  'anthropic', 'claude-3-5-sonnet', 'Claude 3.5 Sonnet (2024-06)', 'multimodal', 1, DATE('now'), DATE('now'), 'manual-seed'),
  ('claude-3-5-haiku-20241022',   'anthropic', 'claude-3-5-haiku',  'Claude 3.5 Haiku',  'text',       1, DATE('now'), DATE('now'), 'manual-seed'),
  ('claude-3-opus-20240229',      'anthropic', 'claude-3-opus',     'Claude 3 Opus',     'multimodal', 1, DATE('now'), DATE('now'), 'manual-seed'),
  ('claude-3-sonnet-20240229',    'anthropic', 'claude-3-sonnet',   'Claude 3 Sonnet',   'multimodal', 1, DATE('now'), DATE('now'), 'manual-seed'),
  ('claude-3-haiku-20240307',     'anthropic', 'claude-3-haiku',    'Claude 3 Haiku',    'multimodal', 1, DATE('now'), DATE('now'), 'manual-seed');

INSERT INTO model_price_snapshots (day, model_id, input_per_mtok, output_per_mtok, source, fetched_at) VALUES
  (DATE('now'), 'claude-opus-4-7',            15.0,  75.0, 'manual-seed', CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  (DATE('now'), 'claude-opus-4-6',            15.0,  75.0, 'manual-seed', CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  (DATE('now'), 'claude-sonnet-4-6',           3.0,  15.0, 'manual-seed', CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  (DATE('now'), 'claude-sonnet-4-5',           3.0,  15.0, 'manual-seed', CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  (DATE('now'), 'claude-haiku-4-5',            0.8,   4.0, 'manual-seed', CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  (DATE('now'), 'claude-3-5-sonnet-20241022',  3.0,  15.0, 'manual-seed', CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  (DATE('now'), 'claude-3-5-sonnet-20240620',  3.0,  15.0, 'manual-seed', CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  (DATE('now'), 'claude-3-5-haiku-20241022',   0.8,   4.0, 'manual-seed', CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  (DATE('now'), 'claude-3-opus-20240229',     15.0,  75.0, 'manual-seed', CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  (DATE('now'), 'claude-3-sonnet-20240229',    3.0,  15.0, 'manual-seed', CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  (DATE('now'), 'claude-3-haiku-20240307',     0.25,  1.25, 'manual-seed', CAST(strftime('%s', 'now') AS INTEGER) * 1000);

-- OpenAI: GPT-5 family
INSERT INTO models_catalog (id, provider, family, display_name, modality, is_active, first_seen_day, last_seen_day, source) VALUES
  ('gpt-5-codex',        'openai', 'gpt-5',  'GPT-5 Codex',        'text',       1, DATE('now'), DATE('now'), 'manual-seed'),
  ('gpt-5-mini',         'openai', 'gpt-5',  'GPT-5 mini',         'text',       1, DATE('now'), DATE('now'), 'manual-seed'),
  ('gpt-5-nano',         'openai', 'gpt-5',  'GPT-5 nano',         'text',       1, DATE('now'), DATE('now'), 'manual-seed'),
  ('gpt-5-pro',          'openai', 'gpt-5',  'GPT-5 Pro',          'multimodal', 1, DATE('now'), DATE('now'), 'manual-seed'),
  ('gpt-5.5',            'openai', 'gpt-5',  'GPT-5.5',            'multimodal', 1, DATE('now'), DATE('now'), 'manual-seed'),
  ('codex-mini-latest',  'openai', 'codex',  'Codex mini (latest)', 'text',      1, DATE('now'), DATE('now'), 'manual-seed');

INSERT INTO model_price_snapshots (day, model_id, input_per_mtok, output_per_mtok, source, fetched_at) VALUES
  (DATE('now'), 'gpt-5-codex',       1.25,  10.0, 'manual-seed', CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  (DATE('now'), 'gpt-5-mini',        0.25,   2.0, 'manual-seed', CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  (DATE('now'), 'gpt-5-nano',        0.05,   0.4, 'manual-seed', CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  (DATE('now'), 'gpt-5-pro',        15.0,  120.0, 'manual-seed', CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  (DATE('now'), 'gpt-5.5',           5.0,   30.0, 'manual-seed', CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  (DATE('now'), 'codex-mini-latest', 1.5,    6.0, 'manual-seed', CAST(strftime('%s', 'now') AS INTEGER) * 1000);

-- OpenAI: GPT-4 family
INSERT INTO models_catalog (id, provider, family, display_name, modality, is_active, first_seen_day, last_seen_day, source) VALUES
  ('gpt-4o',        'openai', 'gpt-4o',  'GPT-4o',         'multimodal', 1, DATE('now'), DATE('now'), 'manual-seed'),
  ('gpt-4o-mini',   'openai', 'gpt-4o',  'GPT-4o mini',    'multimodal', 1, DATE('now'), DATE('now'), 'manual-seed'),
  ('gpt-4-turbo',   'openai', 'gpt-4',   'GPT-4 Turbo',    'multimodal', 1, DATE('now'), DATE('now'), 'manual-seed'),
  ('gpt-4.1',       'openai', 'gpt-4.1', 'GPT-4.1',        'multimodal', 1, DATE('now'), DATE('now'), 'manual-seed'),
  ('gpt-4.1-mini',  'openai', 'gpt-4.1', 'GPT-4.1 mini',   'multimodal', 1, DATE('now'), DATE('now'), 'manual-seed'),
  ('gpt-4.1-nano',  'openai', 'gpt-4.1', 'GPT-4.1 nano',   'multimodal', 1, DATE('now'), DATE('now'), 'manual-seed');

INSERT INTO model_price_snapshots (day, model_id, input_per_mtok, output_per_mtok, source, fetched_at) VALUES
  (DATE('now'), 'gpt-4o',        2.5,  10.0, 'manual-seed', CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  (DATE('now'), 'gpt-4o-mini',   0.15,  0.6, 'manual-seed', CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  (DATE('now'), 'gpt-4-turbo',  10.0,  30.0, 'manual-seed', CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  (DATE('now'), 'gpt-4.1',       2.0,   8.0, 'manual-seed', CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  (DATE('now'), 'gpt-4.1-mini',  0.4,   1.6, 'manual-seed', CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  (DATE('now'), 'gpt-4.1-nano',  0.1,   0.4, 'manual-seed', CAST(strftime('%s', 'now') AS INTEGER) * 1000);

-- OpenAI: reasoning models (o-series)
INSERT INTO models_catalog (id, provider, family, display_name, modality, is_active, first_seen_day, last_seen_day, source) VALUES
  ('o1',       'openai', 'o1', 'o1',       'text', 1, DATE('now'), DATE('now'), 'manual-seed'),
  ('o1-mini',  'openai', 'o1', 'o1 mini',  'text', 1, DATE('now'), DATE('now'), 'manual-seed'),
  ('o3',       'openai', 'o3', 'o3',       'text', 1, DATE('now'), DATE('now'), 'manual-seed'),
  ('o3-mini',  'openai', 'o3', 'o3 mini',  'text', 1, DATE('now'), DATE('now'), 'manual-seed'),
  ('o4-mini',  'openai', 'o4', 'o4 mini',  'text', 1, DATE('now'), DATE('now'), 'manual-seed');

INSERT INTO model_price_snapshots (day, model_id, input_per_mtok, output_per_mtok, source, fetched_at) VALUES
  (DATE('now'), 'o1',       15.0,  60.0, 'manual-seed', CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  (DATE('now'), 'o1-mini',   3.0,  12.0, 'manual-seed', CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  (DATE('now'), 'o3',        2.0,   8.0, 'manual-seed', CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  (DATE('now'), 'o3-mini',   1.1,   4.4, 'manual-seed', CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  (DATE('now'), 'o4-mini',   1.1,   4.4, 'manual-seed', CAST(strftime('%s', 'now') AS INTEGER) * 1000);

-- Cursor: synthetic "cursor-composer" row priced at claude-3-5-sonnet rates
-- ($3 in / $15 out per MTok) so the historical estimate the cursor parser
-- used to compute inline remains consistent post-server-side stamping.
-- Marked source='cursor-estimate' so the cron's deactivation sweep leaves it
-- alone (it's never going to appear in OpenRouter).
INSERT INTO models_catalog (id, provider, family, display_name, modality, is_active, first_seen_day, last_seen_day, source, notes) VALUES
  ('cursor-composer', 'cursor', 'cursor-composer', 'Cursor Composer (estimate)', 'text', 1, DATE('now'), DATE('now'), 'cursor-estimate',
   'Synthetic model — token counts are estimated by the parser; cost mirrors claude-3-5-sonnet rates for consistency');

INSERT INTO model_price_snapshots (day, model_id, input_per_mtok, output_per_mtok, source, fetched_at) VALUES
  (DATE('now'), 'cursor-composer', 3.0, 15.0, 'cursor-estimate', CAST(strftime('%s', 'now') AS INTEGER) * 1000);
