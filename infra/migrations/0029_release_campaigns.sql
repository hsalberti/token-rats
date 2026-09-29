CREATE TABLE release_views (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  release_id TEXT NOT NULL,
  seen_at INTEGER NOT NULL,
  dismissed_at INTEGER,
  PRIMARY KEY(user_id, release_id)
);
CREATE TABLE release_email_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE email_suppressions (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE release_campaigns (
  id TEXT PRIMARY KEY,
  release_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','sending','complete','paused')),
  audience_total INTEGER NOT NULL,
  missing_email INTEGER NOT NULL,
  excluded INTEGER NOT NULL
);
CREATE TABLE campaign_recipients (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES release_campaigns(id),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL COLLATE NOCASE,
  had_usage INTEGER NOT NULL,
  had_setup INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','failed','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  first_attempt_at INTEGER,
  next_attempt_at INTEGER NOT NULL DEFAULT 0,
  sent_at INTEGER,
  provider_id TEXT,
  delivered_at INTEGER,
  opened_at INTEGER,
  clicked_at INTEGER,
  returned_at INTEGER,
  returned_after_click_at INTEGER,
  usage_at INTEGER,
  setup_at INTEGER,
  bounced_at INTEGER,
  complained_at INTEGER,
  unsubscribed_at INTEGER,
  error TEXT,
  UNIQUE(campaign_id,user_id),
  UNIQUE(campaign_id,email)
);
CREATE INDEX campaign_recipients_owner ON campaign_recipients(user_id,sent_at);
CREATE INDEX campaign_recipients_provider ON campaign_recipients(provider_id);
CREATE INDEX campaign_recipients_queue ON campaign_recipients(status,next_attempt_at);
