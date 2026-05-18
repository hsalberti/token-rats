CREATE TABLE user_anthropic_keys (
  user_id    TEXT PRIMARY KEY,
  ciphertext TEXT NOT NULL,
  iv         TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
