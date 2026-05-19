-- v1.2 Track AC: verified Twitter/X handle.
-- `users.twitter_handle` already exists (migration 0005) as an unverified manual field;
-- we add the verification metadata and the immutable X user id.

ALTER TABLE users ADD COLUMN twitter_user_id      TEXT;
ALTER TABLE users ADD COLUMN twitter_verified_at  INTEGER;

CREATE UNIQUE INDEX idx_users_twitter_user_id ON users(twitter_user_id) WHERE twitter_user_id IS NOT NULL;
