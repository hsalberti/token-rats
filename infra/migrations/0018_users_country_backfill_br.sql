-- 0018_users_country_backfill_br.sql
--
-- One-shot backfill: stamp `users.country = 'BR'` on every row where it's
-- still NULL. Migration 0015 only populated country for users who owned a
-- country-stamped public room; legacy users who joined Brazilian rooms (but
-- never owned one) and pre-0015 signups who haven't logged in since stayed
-- NULL, which silently dropped them from the /groups country board.
--
-- Reality check (2026-05): the live user base is effectively all Brazilian,
-- so a blanket BR stamp restores the invariant "Brazil board ⊂ Global
-- leaderboard" without requiring users to log in again.
--
-- Future signups are unaffected: the auth handler still stamps
-- cf-ipcountry on INSERT, so non-BR users created from here on get their
-- actual country.

UPDATE users SET country = 'BR' WHERE country IS NULL;
