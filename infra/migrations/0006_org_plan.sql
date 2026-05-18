-- Phase 3 Track O: Org plan (paid)
-- Extends `orgs` with slug, plan tier, Stripe IDs, seat count, and GitHub org login.
-- Adds `org_invites` for email and GitHub-based invite flow.

ALTER TABLE orgs ADD COLUMN slug TEXT;
ALTER TABLE orgs ADD COLUMN plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free','pro'));
ALTER TABLE orgs ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE orgs ADD COLUMN stripe_subscription_id TEXT;
ALTER TABLE orgs ADD COLUMN seat_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orgs ADD COLUMN github_org_login TEXT;  -- For GitHub org auto-invite

CREATE UNIQUE INDEX idx_orgs_slug ON orgs(slug) WHERE slug IS NOT NULL;
CREATE INDEX idx_orgs_github_org ON orgs(github_org_login);

CREATE TABLE org_invites (
  id           TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL,
  email        TEXT,           -- nullable; one of email OR github_login required
  github_login TEXT,
  invited_by   TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  accepted_at  INTEGER,
  FOREIGN KEY (org_id)     REFERENCES orgs(id),
  FOREIGN KEY (invited_by) REFERENCES users(id)
);
CREATE INDEX idx_org_invites_org ON org_invites(org_id);
