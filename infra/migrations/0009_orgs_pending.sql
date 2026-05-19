-- v1.2 — Soft-create org waitlist + student tier.
--
-- Adds the soft-create columns to `orgs` and widens the `plan` CHECK
-- constraint from ('free','pro') to ('free','student','pro'). Widening a
-- CHECK requires a table rebuild in SQLite — `ALTER TABLE ... DROP
-- CONSTRAINT` is not supported.
--
-- Foreign keys from `rooms`, `org_members`, and `org_invites` point at
-- `orgs(id)`. D1 has FK checks ON by default, so we defer them for the
-- duration of this migration so the DROP + RENAME doesn't trip on rows in
-- the dependent tables.

PRAGMA defer_foreign_keys = TRUE;

CREATE TABLE orgs_new (
  id                     TEXT PRIMARY KEY,
  name                   TEXT NOT NULL,
  slug                   TEXT,
  plan                   TEXT NOT NULL DEFAULT 'free'
                          CHECK (plan IN ('free','student','pro')),
  stripe_customer_id     TEXT,
  stripe_subscription_id TEXT,
  seat_count             INTEGER NOT NULL DEFAULT 0,
  github_org_login       TEXT,
  created_at             INTEGER NOT NULL,
  -- Soft-create / approval flow.
  status                 TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','approved')),
  requested_plan         TEXT
                          CHECK (requested_plan IN ('free','student','pro')),
  founder_email          TEXT,
  founder_name           TEXT,
  approved_by            TEXT,
  approved_at            INTEGER,
  FOREIGN KEY (approved_by) REFERENCES users(id)
);

-- Carry forward every existing row, defaulting status='approved' so the
-- pre-feature orgs aren't gated by the new pending check. `requested_plan`
-- mirrors the current `plan` for retroactive coherence.
INSERT INTO orgs_new
  (id, name, slug, plan, stripe_customer_id, stripe_subscription_id,
   seat_count, github_org_login, created_at,
   status, requested_plan, founder_email, founder_name, approved_by, approved_at)
SELECT id, name, slug, plan, stripe_customer_id, stripe_subscription_id,
       seat_count, github_org_login, created_at,
       'approved', plan, NULL, NULL, NULL, NULL
  FROM orgs;

DROP TABLE orgs;
ALTER TABLE orgs_new RENAME TO orgs;

-- Restore indexes that were attached to the old `orgs` table.
CREATE UNIQUE INDEX idx_orgs_slug      ON orgs(slug)             WHERE slug IS NOT NULL;
CREATE INDEX        idx_orgs_github_org ON orgs(github_org_login);
-- New: cheap lookup of pending orgs by founder or by recency.
CREATE INDEX        idx_orgs_status     ON orgs(status);
