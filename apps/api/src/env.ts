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
  /** Durable Object namespace for per-room live fan-out (Phase 3 Track L) */
  ROOM_LIVE: DurableObjectNamespace;
  /** Optional Anthropic API key for the proxy (Worker secret). When set, used as the
   *  fallback key for all proxy requests that don't have a per-user key stored. */
  ANTHROPIC_API_KEY?: string;
  /** Stripe secret key (sk_live_* / sk_test_*). Used by API proxy calls if ever needed. */
  STRIPE_SECRET_KEY: string;
  /** Stripe webhook signing secret (whsec_*). Used to verify incoming webhook signatures. */
  STRIPE_WEBHOOK_SECRET: string;
  /** Twitter/X OAuth client id (v1.2 Track AC). Optional — when unset, the
   *  /v1/auth/twitter/* endpoints respond 503 and the UI hides the Connect button. */
  X_OAUTH_CLIENT_ID?: string;
  /** Twitter/X OAuth client secret (v1.2 Track AC). Worker secret. */
  X_OAUTH_CLIENT_SECRET?: string;
};
