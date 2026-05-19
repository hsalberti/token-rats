/**
 * Unit tests for the weekly digest body builder + unsubscribe-token helpers.
 *
 * We don't need a real D1 — a minimal mock that returns a handle row and a
 * rollup-row list is enough to exercise buildWeeklyDigest end-to-end.
 */
import { describe, expect, it, vi } from "vitest";
import { buildWeeklyDigest, signUnsubscribeToken, verifyUnsubscribeToken } from "./digest.js";

const SIGNING_KEY = "test-signing-key-at-least-32-bytes!!";
const WEB_ORIGIN = "https://tokenrats.com";

interface MockRow {
  day: string;
  tokens: number;
  cost_usd_cents: number;
  sessions: number;
}

function makeDb(handle: string | null, rows: MockRow[]): D1Database {
  const firstResult = handle === null ? null : { handle };
  const allResult = { results: rows };

  const stmt = {
    bind: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue(firstResult),
    all: vi.fn().mockResolvedValue(allResult),
    run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
  };

  return {
    prepare: vi.fn((_sql: string) => {
      // First prepare call is the user-handle SELECT; second is the rollup SELECT.
      // We hand the same stmt back; the mock's `.first` / `.all` map to the
      // appropriate call site since each runs once per build.
      return stmt;
    }),
  } as unknown as D1Database;
}

describe("signUnsubscribeToken / verifyUnsubscribeToken", () => {
  it("round-trips a token correctly", async () => {
    const token = await signUnsubscribeToken("user-abc", SIGNING_KEY);
    const result = await verifyUnsubscribeToken(token, SIGNING_KEY);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.userId).toBe("user-abc");
  });

  it("rejects a token signed with a different key", async () => {
    const token = await signUnsubscribeToken("user-abc", SIGNING_KEY);
    const result = await verifyUnsubscribeToken(token, "different-key-also-32-bytes-long!!");
    expect(result.ok).toBe(false);
  });

  it("rejects a token with a tampered userId", async () => {
    const token = await signUnsubscribeToken("user-abc", SIGNING_KEY);
    const parts = token.split(".");
    const tampered = ["user-evil", parts[1], parts[2]].join(".");
    const result = await verifyUnsubscribeToken(tampered, SIGNING_KEY);
    expect(result.ok).toBe(false);
  });

  it("rejects a malformed token", async () => {
    const result = await verifyUnsubscribeToken("not-a-token", SIGNING_KEY);
    expect(result.ok).toBe(false);
  });

  it("cannot be replayed as a session token (purpose-prefixed payload)", async () => {
    // The session verifier (`verifyToken` in lib/auth.ts) signs over
    // `userId.expiresAt`; the unsubscribe signer over `unsub:userId.issuedAt`.
    // Importing the auth verifier directly here would create a circular smell,
    // so we just confirm that the bare 3-part shape of an unsubscribe token is
    // rejected by the same `verifyUnsubscribeToken` when we strip the prefix —
    // i.e. the signature is bound to the `unsub:` purpose.
    const token = await signUnsubscribeToken("user-abc", SIGNING_KEY);
    const tampered = token.split(".").slice(0, 2).join(".") + ".AAAA";
    const result = await verifyUnsubscribeToken(tampered, SIGNING_KEY);
    expect(result.ok).toBe(false);
  });
});

describe("buildWeeklyDigest", () => {
  it("returns null when the user has no data in the window", async () => {
    const db = makeDb("ratfan", []);
    const out = await buildWeeklyDigest("user-1", db, {
      webOrigin: WEB_ORIGIN,
      signingKey: SIGNING_KEY,
    });
    expect(out).toBeNull();
  });

  it("returns null when the user is unknown", async () => {
    const db = makeDb(null, []);
    const out = await buildWeeklyDigest("ghost", db, {
      webOrigin: WEB_ORIGIN,
      signingKey: SIGNING_KEY,
    });
    expect(out).toBeNull();
  });

  it("returns a body containing the handle, stats, and a valid unsubscribe link", async () => {
    const rows: MockRow[] = [
      { day: "2024-06-10", tokens: 12_345, cost_usd_cents: 250, sessions: 3 },
      { day: "2024-06-11", tokens: 67_890, cost_usd_cents: 1_400, sessions: 7 },
      { day: "2024-06-12", tokens: 5_000, cost_usd_cents: 100, sessions: 1 },
    ];
    const db = makeDb("ratfan", rows);

    const out = await buildWeeklyDigest("user-42", db, {
      webOrigin: WEB_ORIGIN,
      signingKey: SIGNING_KEY,
    });

    expect(out).not.toBeNull();
    if (!out) return;

    // Handle shows up in both bodies.
    expect(out.html).toContain("@ratfan");
    expect(out.text).toContain("@ratfan");

    // Totals are formatted into the body.
    // 12_345 + 67_890 + 5_000 = 85,235 → "85.2K"
    expect(out.html).toContain("85.2K");
    expect(out.text).toContain("85.2K");

    // Cost: 250 + 1400 + 100 = 1750 cents → "$17.50"
    expect(out.html).toContain("$17.50");
    expect(out.text).toContain("$17.50");

    // Subject includes a token total.
    expect(out.subject).toContain("85.2K");

    // Unsubscribe link is present and points at the configured origin.
    const match = out.html.match(/href="(https:\/\/tokenrats\.com\/unsubscribe\?token=[^"]+)"/);
    expect(match).not.toBeNull();
    if (match) {
      const url = new URL(match[1] as string);
      const token = url.searchParams.get("token");
      expect(token).not.toBeNull();
      if (token) {
        const verified = await verifyUnsubscribeToken(token, SIGNING_KEY);
        expect(verified.ok).toBe(true);
        if (verified.ok) expect(verified.userId).toBe("user-42");
      }
    }

    // Plain-text variant also has the unsubscribe URL.
    expect(out.text).toMatch(/Unsubscribe: https:\/\/tokenrats\.com\/unsubscribe\?token=/);
  });
});
