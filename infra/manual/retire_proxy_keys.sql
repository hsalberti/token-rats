-- Run after the API proxy routes are retired, never before deployment.
-- This intentionally deletes credentials that no longer have a use.
DROP TABLE user_proxy_keys;
DROP TABLE user_anthropic_keys;
