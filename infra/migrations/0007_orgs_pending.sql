-- v1.2 Track AA: soft-create org waitlist
-- Adds `status` column (active|pending) and extends plan CHECK to include 'student'.
-- SQLite can't ALTER a CHECK constraint, so we recreate the table.

PRAGMA foreign_keys=off;

CREATE TABLE orgs_new (
  id                     TEXT PRIMARY KEY,
  name                   TEXT NOT NULL,
  created_at             INTEGER NOT NULL,
  slug                   TEXT,
  plan                   TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free','pro','student')),
  stripe_customer_id     TEXT,
  stripe_subscription_id TEXT,
  seat_count             INTEGER NOT NULL DEFAULT 0,
  github_org_login       TEXT,
  status                 TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','pending'))
);

INSERT INTO orgs_new (id, name, created_at, slug, plan, stripe_customer_id, stripe_subscription_id, seat_count, github_org_login, status)
  SELECT id, name, created_at, slug, plan, stripe_customer_id, stripe_subscription_id, seat_count, github_org_login, 'active'
  FROM orgs;

DROP TABLE orgs;
ALTER TABLE orgs_new RENAME TO orgs;

CREATE UNIQUE INDEX idx_orgs_slug ON orgs(slug) WHERE slug IS NOT NULL;
CREATE INDEX idx_orgs_github_org ON orgs(github_org_login);
CREATE INDEX idx_orgs_status_created ON orgs(status, created_at);

PRAGMA foreign_keys=on;
