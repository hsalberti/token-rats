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
  /**
   * v1.2 Track AA — comma-separated GitHub handles that may hit `/v1/admin/*`.
   * Set via wrangler vars (non-secret) for prod / `.dev.vars` for local dev.
   * Falls back to a single bootstrap handle below if unset (local-only safety net).
   */
  ADMIN_HANDLES?: string;
  /**
   * v1.2 Track AB — Resend API key (`wrangler secret put EMAIL_PROVIDER_API_KEY`).
   * When unset, `lib/email.ts` falls back to the console-log stub so local dev
   * and CI keep working without a secret.
   */
  EMAIL_PROVIDER_API_KEY?: string;
};
