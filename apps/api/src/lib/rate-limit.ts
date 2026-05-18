/**
 * Sliding-window rate limiter backed by Cloudflare KV.
 *
 * Key: `rl:<userId>:<windowStartMinute>`
 * Value: JSON string of a counter.
 *
 * Each key is created with a 120s TTL so they clean up automatically.
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

/**
 * Check and increment the request counter for a user.
 *
 * @param kv       – KV namespace
 * @param userId   – unique identifier for the user
 * @param limit    – max requests per window
 * @param windowMs – window duration in ms (default 60 000 = 1 min)
 */
export async function rateLimit(
  kv: KVNamespace,
  userId: string,
  limit: number,
  windowMs = 60_000,
): Promise<RateLimitResult> {
  const window = Math.floor(Date.now() / windowMs);
  const key = `rl:${userId}:${window}`;

  // Read current count
  const raw = await kv.get(key);
  const count = raw ? Number(raw) : 0;

  if (count >= limit) {
    return { allowed: false, remaining: 0 };
  }

  // Increment; TTL is 2× window so overlap is handled gracefully
  const ttlSeconds = Math.ceil((windowMs * 2) / 1000);
  await kv.put(key, String(count + 1), { expirationTtl: ttlSeconds });

  return { allowed: true, remaining: limit - count - 1 };
}
