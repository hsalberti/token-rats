export type Env = {
  DB: D1Database;
  CACHE: KVNamespace;
  CARDS: R2Bucket;
  WEB_ORIGIN: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  SESSION_SIGNING_KEY: string;
  /** VAPID private key (base64url-encoded raw EC P-256 key, set via `wrangler secret put`) */
  VAPID_PRIVATE_KEY: string;
  /** VAPID public key (base64url-encoded uncompressed P-256 point) */
  VAPID_PUBLIC_KEY: string;
};
