-- v1.2 — Public country-locked groups.
--
-- `rooms.is_public` flags a room as publicly discoverable / joinable.
-- `rooms.country` is the ISO-3166-1 alpha-2 country code (as returned by
-- Cloudflare's `cf-ipcountry` header) that gates discovery and joining for
-- public rooms. Both are nullable / default to private for backwards
-- compatibility — every existing room reads as `is_public=0, country=NULL`.
--
-- The partial index keeps `/groups` lookups (by country, public only) cheap
-- without bloating the index when the public-rooms set is small.

ALTER TABLE rooms ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0;
ALTER TABLE rooms ADD COLUMN country   TEXT;

CREATE INDEX idx_rooms_public_country
  ON rooms(country)
  WHERE is_public = 1;
