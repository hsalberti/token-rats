-- v1.2 Track AE: public country-locked rooms.
-- `country` is ISO 3166-1 alpha-2; required when `is_public = 1`.

ALTER TABLE rooms ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0;
ALTER TABLE rooms ADD COLUMN country   TEXT;

CREATE INDEX idx_rooms_public_country_created ON rooms(is_public, country, created_at);
