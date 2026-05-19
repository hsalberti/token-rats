/**
 * Referral code helpers.
 *
 * A referral code is a short URL-safe random string attached to each user.
 * Generated lazily on first read (or eagerly at signup for new users).
 * Used as the `?ref=<code>` query param on landing / room invite links so
 * we can record `referrals(referred → referrer)` when a brand-new user
 * signs up via someone else's link.
 */

import { randomBase64url } from "./auth.js";

/** Length in bytes — 6 bytes encodes to 8 base64url chars. */
const REFERRAL_CODE_BYTES = 6;

/** Cheap format gate before hitting the DB. */
const REFERRAL_CODE_RE = /^[A-Za-z0-9_-]{6,32}$/;

export function isValidReferralCodeFormat(code: string): boolean {
  return REFERRAL_CODE_RE.test(code);
}

export function generateReferralCode(): string {
  return randomBase64url(REFERRAL_CODE_BYTES);
}

/**
 * Fetch the user's referral code, generating + persisting one if missing.
 * The UNIQUE index on users.referral_code means a vanishingly rare race
 * would surface as a constraint error — we retry a few times.
 */
export async function ensureReferralCode(db: D1Database, userId: string): Promise<string> {
  const existing = await db
    .prepare("SELECT referral_code FROM users WHERE id = ?")
    .bind(userId)
    .first<{ referral_code: string | null }>();

  if (existing?.referral_code) return existing.referral_code;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateReferralCode();
    try {
      await db
        .prepare("UPDATE users SET referral_code = ? WHERE id = ? AND referral_code IS NULL")
        .bind(code, userId)
        .run();

      // Re-read: another concurrent caller may have set a different code.
      const row = await db
        .prepare("SELECT referral_code FROM users WHERE id = ?")
        .bind(userId)
        .first<{ referral_code: string | null }>();
      if (row?.referral_code) return row.referral_code;
    } catch {
      // UNIQUE collision on the code itself — try a new one.
    }
  }
  throw new Error("failed to allocate referral code");
}

/**
 * Look up the user id of whoever owns this referral code, or null.
 * Returns null for unknown / malformed codes.
 */
export async function referrerIdForCode(db: D1Database, code: string): Promise<string | null> {
  if (!isValidReferralCodeFormat(code)) return null;
  const row = await db
    .prepare("SELECT id FROM users WHERE referral_code = ?")
    .bind(code)
    .first<{ id: string }>();
  return row?.id ?? null;
}

/**
 * Record that `referredUserId` was brought in by `referrerUserId`.
 * No-ops if either id is missing, ids are equal, or a row already exists.
 */
export async function recordReferral(
  db: D1Database,
  referredUserId: string,
  referrerUserId: string,
  now: number,
): Promise<void> {
  if (!referredUserId || !referrerUserId) return;
  if (referredUserId === referrerUserId) return;
  await db
    .prepare(
      `INSERT OR IGNORE INTO referrals (referred_user_id, referrer_user_id, created_at)
       VALUES (?, ?, ?)`,
    )
    .bind(referredUserId, referrerUserId, now)
    .run();
}
