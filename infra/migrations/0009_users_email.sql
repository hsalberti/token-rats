-- v1.2 Track AB: email column on users.
-- Populated from GitHub primary verified email on every OAuth callback.

ALTER TABLE users ADD COLUMN email TEXT;
CREATE INDEX idx_users_email ON users(email);
