import { GetReferralResponse, ReferralStats } from "@token-rats/contracts";
/**
 * Unit tests for the referral helpers + GetReferralResponse contract.
 * Pure logic only — no D1, no network.
 */
import { describe, expect, it } from "vitest";
import {
  generateReferralCode,
  isValidReferralCodeFormat,
  recordReferral,
  referrerIdForCode,
} from "../lib/referral.js";

describe("referral code generation", () => {
  it("produces URL-safe codes that pass the format gate", () => {
    for (let i = 0; i < 20; i++) {
      const c = generateReferralCode();
      expect(isValidReferralCodeFormat(c)).toBe(true);
      expect(c).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(c.length).toBeGreaterThanOrEqual(6);
    }
  });

  it("rejects obviously bad codes", () => {
    expect(isValidReferralCodeFormat("")).toBe(false);
    expect(isValidReferralCodeFormat("short")).toBe(false);
    expect(isValidReferralCodeFormat("has spaces here")).toBe(false);
    expect(isValidReferralCodeFormat("inj';--ect")).toBe(false);
    expect(isValidReferralCodeFormat("x".repeat(33))).toBe(false);
  });
});

describe("ReferralStats contract", () => {
  it("accepts an empty stats payload", () => {
    const parsed = ReferralStats.parse({ code: "abc123XY", count: 0, recent: [] });
    expect(parsed.count).toBe(0);
    expect(parsed.recent).toEqual([]);
  });

  it("accepts a populated recent list", () => {
    const parsed = GetReferralResponse.parse({
      referral: {
        code: "abc123XY",
        count: 2,
        recent: [
          { handle: "ada", avatarUrl: "https://example.com/a.png", createdAt: 1 },
          { handle: "linus", avatarUrl: null, createdAt: 2 },
        ],
      },
    });
    expect(parsed.referral.count).toBe(2);
    expect(parsed.referral.recent).toHaveLength(2);
  });

  it("rejects a negative count", () => {
    const r = ReferralStats.safeParse({ code: "abc123XY", count: -1, recent: [] });
    expect(r.success).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Round-trip: referrer code → referral row                                    */
/* -------------------------------------------------------------------------- */

/**
 * Minimal in-memory D1 stub covering only the SQL referrerIdForCode +
 * recordReferral actually issue. Mirrors the auth-twitter test pattern.
 */
type UserRow = { id: string; referral_code: string | null };
type ReferralRow = { referred_user_id: string; referrer_user_id: string; created_at: number };

function makeReferralDb(seed: {
  users: UserRow[];
  referrals?: ReferralRow[];
}): { db: D1Database; referrals: ReferralRow[] } {
  const users = seed.users;
  const referrals: ReferralRow[] = seed.referrals ?? [];

  function exec(sql: string, params: unknown[]): { first: unknown; changes: number } {
    const trimmed = sql.replace(/\s+/g, " ").trim();

    if (/^SELECT id FROM users WHERE referral_code = \?$/.test(trimmed)) {
      const [code] = params as [string];
      const u = users.find((x) => x.referral_code === code);
      return { first: u ? { id: u.id } : null, changes: 0 };
    }

    if (
      /^INSERT OR IGNORE INTO referrals \(referred_user_id, referrer_user_id, created_at\) VALUES \(\?, \?, \?\)$/.test(
        trimmed,
      )
    ) {
      const [referredId, referrerId, createdAt] = params as [string, string, number];
      const exists = referrals.some((r) => r.referred_user_id === referredId);
      if (!exists) {
        referrals.push({
          referred_user_id: referredId,
          referrer_user_id: referrerId,
          created_at: createdAt,
        });
        return { first: null, changes: 1 };
      }
      return { first: null, changes: 0 };
    }

    throw new Error(`Unmocked SQL: ${trimmed}`);
  }

  function makeStmt(sql: string, bound: unknown[] = []): D1PreparedStatement {
    return {
      bind(...args: unknown[]) {
        return makeStmt(sql, args);
      },
      async first<T>() {
        return exec(sql, bound).first as T;
      },
      async run() {
        const r = exec(sql, bound);
        return { success: true, meta: { changes: r.changes } };
      },
    } as unknown as D1PreparedStatement;
  }

  const db = {
    prepare(sql: string) {
      return makeStmt(sql);
    },
  } as unknown as D1Database;

  return { db, referrals };
}

describe("recordReferral / referrerIdForCode round-trip", () => {
  it("looks up a referrer by code, then records the new signup edge", async () => {
    const { db, referrals } = makeReferralDb({
      users: [{ id: "alice-uid", referral_code: "aliceXX" }],
    });

    const referrerId = await referrerIdForCode(db, "aliceXX");
    expect(referrerId).toBe("alice-uid");

    if (referrerId) {
      await recordReferral(db, "bob-uid", referrerId, 1700000000000);
    }
    expect(referrals).toEqual([
      { referred_user_id: "bob-uid", referrer_user_id: "alice-uid", created_at: 1700000000000 },
    ]);
  });

  it("returns null for an unknown code without touching referrals", async () => {
    const { db, referrals } = makeReferralDb({
      users: [{ id: "alice-uid", referral_code: "aliceXX" }],
    });

    const referrerId = await referrerIdForCode(db, "unknown123");
    expect(referrerId).toBeNull();
    expect(referrals).toEqual([]);
  });

  it("rejects malformed codes before hitting the DB", async () => {
    const { db } = makeReferralDb({ users: [] });
    expect(await referrerIdForCode(db, "")).toBeNull();
    expect(await referrerIdForCode(db, "has spaces")).toBeNull();
    expect(await referrerIdForCode(db, "x")).toBeNull(); // too short
  });

  it("no-ops when referrer == referred (self-credit guard)", async () => {
    const { db, referrals } = makeReferralDb({ users: [] });
    await recordReferral(db, "alice-uid", "alice-uid", 1);
    expect(referrals).toEqual([]);
  });

  it("is idempotent: a second signup by the same user adds no row", async () => {
    const { db, referrals } = makeReferralDb({
      users: [{ id: "alice-uid", referral_code: "aliceXX" }],
    });

    await recordReferral(db, "bob-uid", "alice-uid", 1);
    await recordReferral(db, "bob-uid", "alice-uid", 2);
    expect(referrals).toHaveLength(1);
  });
});
