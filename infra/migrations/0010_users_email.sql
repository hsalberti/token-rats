-- v1.2 — Email capture.
--
-- Adds `email` to the users table. Nullable: some GitHub users have no
-- primary verified email at the time of login (we leave it NULL and show
-- a banner asking them to add one + re-sign-in).
--
-- This migration is purely additive — no rebuild required.

ALTER TABLE users ADD COLUMN email TEXT;
