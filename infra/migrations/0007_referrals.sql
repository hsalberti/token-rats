-- Migration 0007: Affiliate / referral links.
--
-- Each user gets a stable `referral_code` (generated lazily on first
-- /v1/me/referral fetch, or eagerly at signup for new users). When a new
-- user signs up via a link carrying that code, we record the directed
-- edge in `referrals` so the referrer can see who they brought in.

ALTER TABLE users ADD COLUMN referral_code TEXT;
CREATE UNIQUE INDEX idx_users_referral_code
  ON users(referral_code) WHERE referral_code IS NOT NULL;

CREATE TABLE referrals (
  referred_user_id TEXT    PRIMARY KEY,
  referrer_user_id TEXT    NOT NULL,
  created_at       INTEGER NOT NULL,
  FOREIGN KEY (referred_user_id) REFERENCES users(id),
  FOREIGN KEY (referrer_user_id) REFERENCES users(id)
);
CREATE INDEX idx_referrals_referrer ON referrals(referrer_user_id);
