/**
 * HMAC-SHA256 session token helpers.
 *
 * Token format (compact, URL-safe):  <userId>.<expiresAt>.<signature>
 *   userId    – opaque string (UUID)
 *   expiresAt – Unix ms (base-10)
 *   signature – base64url HMAC-SHA256 over "userId.expiresAt"
 *
 * The signing key is imported once per request via Web Crypto.
 */

const ALG = { name: "HMAC", hash: "SHA-256" };

/** Import a raw base64 or UTF-8 signing key into a CryptoKey. */
async function importKey(raw: string): Promise<CryptoKey> {
  const keyBytes = new TextEncoder().encode(raw);
  return crypto.subtle.importKey("raw", keyBytes, ALG, false, ["sign", "verify"]);
}

function b64urlEncode(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - (padded.length % 4)) % 4;
  const bin = atob(padded + "=".repeat(pad));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Mint a signed token valid for `ttlMs` milliseconds. */
export async function signToken(
  userId: string,
  signingKey: string,
  ttlMs: number,
): Promise<string> {
  const expiresAt = Date.now() + ttlMs;
  const payload = `${userId}.${expiresAt}`;
  const key = await importKey(signingKey);
  const sig = await crypto.subtle.sign(ALG, key, new TextEncoder().encode(payload));
  return `${payload}.${b64urlEncode(sig)}`;
}

export type VerifyResult = { ok: true; userId: string } | { ok: false; reason: string };

/** Verify and decode a token. Returns { ok, userId } or { ok: false, reason }. */
export async function verifyToken(token: string, signingKey: string): Promise<VerifyResult> {
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };

  const [userId, expiresAtStr, sigB64] = parts as [string, string, string];
  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt)) return { ok: false, reason: "malformed" };
  if (Date.now() > expiresAt) return { ok: false, reason: "expired" };

  const payload = `${userId}.${expiresAtStr}`;
  const key = await importKey(signingKey);
  const sigBytes = b64urlDecode(sigB64);
  const valid = await crypto.subtle.verify(ALG, key, sigBytes, new TextEncoder().encode(payload));
  if (!valid) return { ok: false, reason: "bad_signature" };
  return { ok: true, userId };
}

/** Generate a cryptographically random base64url string of ~byteLen bytes. */
export function randomBase64url(byteLen: number): string {
  const buf = new Uint8Array(byteLen);
  crypto.getRandomValues(buf);
  return b64urlEncode(buf.buffer);
}

/** Generate a human-friendly verification code: ABCD-1234 */
export function randomVerificationCode(): string {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "0123456789";
  const buf = new Uint8Array(8);
  crypto.getRandomValues(buf);
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += letters[(buf[i] as number) % letters.length];
  }
  code += "-";
  for (let i = 4; i < 8; i++) {
    code += digits[(buf[i] as number) % digits.length];
  }
  return code;
}

import { MONTH_MS } from "./time.js";

/** 30 days in ms */
export const TOKEN_TTL_CLI = MONTH_MS;
/** 30 days in ms */
export const TOKEN_TTL_WEB = MONTH_MS;

/** Cookie name */
export const SESSION_COOKIE = "__Host-tr_session";
