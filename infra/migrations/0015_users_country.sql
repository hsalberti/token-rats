-- Migration 0015: per-user country attribution.
--
-- Stamps a user's ISO-3166-1 alpha-2 country code (from Cloudflare's
-- `cf-ipcountry` header) on their row at first sign-in. Drives the public
-- "country board" surface at /groups, which ranks public users in the
-- viewer's country by 30d tokens.
--
-- Set-once semantics, mirroring `rooms.country`: once stamped, the field is
-- not overwritten on subsequent logins so a VPN / travel session doesn't
-- bounce a user between boards. Auth code only stamps when NULL.
--
-- Backfill: copy a country for every user who already owns at least one
-- public room (since those rooms are country-stamped). Multi-country owners
-- are pinned to whichever country they own the most public rooms in, with
-- ties broken arbitrarily by MIN(country) so the backfill is deterministic.

ALTER TABLE users ADD COLUMN country TEXT;

-- Partial index — the only query that uses this column is
-- "public users in country X", so we don't pay for rows we'd never read.
CREATE INDEX idx_users_country_public
  ON users(country)
  WHERE country IS NOT NULL AND public_profile = 1;

UPDATE users
   SET country = (
     SELECT r.country
       FROM rooms r
      WHERE r.owner_id = users.id
        AND r.is_public = 1
        AND r.country IS NOT NULL
      GROUP BY r.country
      ORDER BY COUNT(*) DESC, r.country ASC
      LIMIT 1
   )
 WHERE country IS NULL;
