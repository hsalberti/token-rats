export type Env = {
  DB: D1Database;
  CACHE: KVNamespace;
  CARDS: R2Bucket;
  WEB_ORIGIN: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  SESSION_SIGNING_KEY: string;
};
