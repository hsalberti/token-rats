import { Hono } from "hono";
/**
 * Tests for /v1/admin/* routes.
 *
 * The admin routes are gated by `requireAuth` AND `isAdmin`. The auth gate
 * itself is tested elsewhere; here we verify:
 *   - Admin denial: a non-admin user receives 403 from each endpoint.
 *   - Happy path: an admin user receives the expected payload shape.
 *
 * D1 is faked by a minimal `prepare().bind().first()/.all()` chain that
 * returns whatever we queue, matching the recordSession test style.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../env.js";
import { SESSION_COOKIE, TOKEN_TTL_WEB, signToken } from "../lib/auth.js";
import type { AuthVariables } from "../middleware/auth.js";
import adminRoutes from "./admin.js";

const SIGNING_KEY = "test-admin-signing-key-32-bytes!!";

type FirstResult = Record<string, unknown> | null;
type AllResult = { results: Record<string, unknown>[] };

interface D1Queue {
  firsts: FirstResult[];
  alls: AllResult[];
  preparedSql: string[];
}

/**
 * Build a D1 mock whose `prepare().bind().first()` and `.all()` calls drain
 * the queues in FIFO order. SQL strings are captured for assertions.
 */
function makeD1(queue: D1Queue): D1Database {
  return {
    prepare: vi.fn((sql: string) => {
      queue.preparedSql.push(sql);
      const stmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn(() => Promise.resolve(queue.firsts.shift() ?? null)),
        all: vi.fn(() => Promise.resolve(queue.alls.shift() ?? { results: [] })),
        run: vi.fn().mockResolvedValue({ meta: { changes: 0 } }),
      };
      return stmt;
    }),
  } as unknown as D1Database;
}

function makeApp(env: Partial<Env>) {
  const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
  app.route("/v1/admin", adminRoutes);

  return {
    fetch: (req: Request) => app.fetch(req, env as Env),
  };
}

async function signedReq(path: string, userId: string): Promise<Request> {
  const token = await signToken(userId, SIGNING_KEY, TOKEN_TTL_WEB);
  return new Request(`http://localhost${path}`, {
    headers: { Cookie: `${SESSION_COOKIE}=${token}` },
  });
}

/* -------------------------------------------------------------------------- */
/* Fixed clock — keeps the 30-day window deterministic                         */
/* -------------------------------------------------------------------------- */

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-19T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

/* -------------------------------------------------------------------------- */
/* Admin gate                                                                  */
/* -------------------------------------------------------------------------- */

describe("admin gate", () => {
  it("returns 403 when ADMIN_GITHUB_LOGIN is unset", async () => {
    const queue: D1Queue = {
      firsts: [{ handle: "anyone" }], // isAdmin lookup
      alls: [],
      preparedSql: [],
    };
    const app = makeApp({
      DB: makeD1(queue),
      SESSION_SIGNING_KEY: SIGNING_KEY,
      // ADMIN_GITHUB_LOGIN intentionally unset
    });

    const res = await app.fetch(await signedReq("/v1/admin/signups", "user-1"));
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("forbidden");
  });

  it("returns 403 when the signed-in user is not the admin", async () => {
    const queue: D1Queue = {
      firsts: [{ handle: "bystander" }],
      alls: [],
      preparedSql: [],
    };
    const app = makeApp({
      DB: makeD1(queue),
      SESSION_SIGNING_KEY: SIGNING_KEY,
      ADMIN_GITHUB_LOGIN: "owner",
    });

    const res = await app.fetch(await signedReq("/v1/admin/signups", "user-1"));
    expect(res.status).toBe(403);
  });

  it("returns 401 when no auth token is presented", async () => {
    const queue: D1Queue = { firsts: [], alls: [], preparedSql: [] };
    const app = makeApp({
      DB: makeD1(queue),
      SESSION_SIGNING_KEY: SIGNING_KEY,
      ADMIN_GITHUB_LOGIN: "owner",
    });

    const res = await app.fetch(new Request("http://localhost/v1/admin/signups"));
    expect(res.status).toBe(401);
  });

  it("admin login match is case-insensitive", async () => {
    const queue: D1Queue = {
      // isAdmin lookup
      firsts: [
        { handle: "Owner" },
        // total users
        { n: 0 },
        // baseline before window
        { n: 0 },
      ],
      // per-day breakdown (empty)
      alls: [{ results: [] }],
      preparedSql: [],
    };
    const app = makeApp({
      DB: makeD1(queue),
      SESSION_SIGNING_KEY: SIGNING_KEY,
      ADMIN_GITHUB_LOGIN: "owner", // different case, should match
    });

    const res = await app.fetch(await signedReq("/v1/admin/signups", "user-1"));
    expect(res.status).toBe(200);
  });
});

/* -------------------------------------------------------------------------- */
/* /signups                                                                    */
/* -------------------------------------------------------------------------- */

describe("GET /v1/admin/signups", () => {
  it("returns a 30-day cumulative series accumulating from the baseline", async () => {
    const queue: D1Queue = {
      firsts: [
        // isAdmin lookup
        { handle: "owner" },
        // total users
        { n: 42 },
        // baseline (users created before the 30-day window)
        { n: 30 },
      ],
      // perDay: two days have new signups
      alls: [
        {
          results: [
            { day: "2026-05-10", n: 5 },
            { day: "2026-05-15", n: 7 },
          ],
        },
      ],
      preparedSql: [],
    };

    const app = makeApp({
      DB: makeD1(queue),
      SESSION_SIGNING_KEY: SIGNING_KEY,
      ADMIN_GITHUB_LOGIN: "owner",
    });

    const res = await app.fetch(await signedReq("/v1/admin/signups", "user-1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      totalUsers: number;
      series: { day: string; newUsers: number; cumulative: number }[];
      generatedAt: number;
    };

    expect(body.totalUsers).toBe(42);
    expect(body.series).toHaveLength(30);

    // Oldest day = 2026-04-20 (today 2026-05-19 - 29 days)
    expect(body.series[0]?.day).toBe("2026-04-20");
    expect(body.series[body.series.length - 1]?.day).toBe("2026-05-19");

    // Days with no new users carry the running total forward from baseline.
    expect(body.series[0]?.cumulative).toBe(30);
    expect(body.series[0]?.newUsers).toBe(0);

    // After 2026-05-10 (+5), cumulative should be 35; after 2026-05-15 (+7) it's 42.
    const may10 = body.series.find((d) => d.day === "2026-05-10");
    const may15 = body.series.find((d) => d.day === "2026-05-15");
    expect(may10?.newUsers).toBe(5);
    expect(may10?.cumulative).toBe(35);
    expect(may15?.newUsers).toBe(7);
    expect(may15?.cumulative).toBe(42);

    expect(body.series[body.series.length - 1]?.cumulative).toBe(42);
  });
});

/* -------------------------------------------------------------------------- */
/* /activity                                                                   */
/* -------------------------------------------------------------------------- */

describe("GET /v1/admin/activity", () => {
  it("returns a 30-day series of distinct active users plus the rolling total", async () => {
    const queue: D1Queue = {
      firsts: [
        // isAdmin lookup
        { handle: "owner" },
        // 30d distinct active total (queried after the per-day .all())
        { n: 11 },
      ],
      // per-day rollup
      alls: [
        {
          results: [
            { day: "2026-05-18", n: 3 },
            { day: "2026-05-19", n: 8 },
          ],
        },
      ],
      preparedSql: [],
    };

    const app = makeApp({
      DB: makeD1(queue),
      SESSION_SIGNING_KEY: SIGNING_KEY,
      ADMIN_GITHUB_LOGIN: "owner",
    });

    const res = await app.fetch(await signedReq("/v1/admin/activity", "user-1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      series: { day: string; activeUsers: number }[];
      activeUsers30d: number;
    };

    expect(body.series).toHaveLength(30);
    expect(body.activeUsers30d).toBe(11);

    const may18 = body.series.find((d) => d.day === "2026-05-18");
    const may19 = body.series.find((d) => d.day === "2026-05-19");
    expect(may18?.activeUsers).toBe(3);
    expect(may19?.activeUsers).toBe(8);

    // Untouched days are 0, not undefined.
    const apr20 = body.series.find((d) => d.day === "2026-04-20");
    expect(apr20?.activeUsers).toBe(0);
  });

  it("clamps activity to days on or after each user's signup", async () => {
    // Locks in the SQL shape so a future refactor can't silently drop
    // the signup-day clamp and reintroduce the "pre-launch active
    // users" bug. The CLI uploads local Claude Code / Cursor logs that
    // can predate signup by months; without this clamp those sessions
    // show up as platform activity on dates the user wasn't yet a user.
    const queue: D1Queue = {
      firsts: [
        { handle: "owner" }, // isAdmin lookup
        { n: 0 }, // 30d total
      ],
      alls: [{ results: [] }], // per-day
      preparedSql: [],
    };

    const app = makeApp({
      DB: makeD1(queue),
      SESSION_SIGNING_KEY: SIGNING_KEY,
      ADMIN_GITHUB_LOGIN: "owner",
    });

    const res = await app.fetch(await signedReq("/v1/admin/activity", "user-1"));
    expect(res.status).toBe(200);

    // The activity handler runs two SQL queries against daily_rollup
    // (per-day + 30d total). Both must JOIN users and include the
    // strftime clamp on u.created_at.
    const dailyRollupSqls = queue.preparedSql.filter((s) => s.includes("FROM daily_rollup"));
    expect(dailyRollupSqls).toHaveLength(2);
    for (const sql of dailyRollupSqls) {
      expect(sql).toContain("JOIN users u ON u.id = dr.user_id");
      expect(sql).toContain("strftime('%Y-%m-%d', u.created_at / 1000, 'unixepoch')");
    }
  });
});

/* -------------------------------------------------------------------------- */
/* /referrers                                                                  */
/* -------------------------------------------------------------------------- */

describe("GET /v1/admin/referrers", () => {
  it("returns tracked=false with a proxy CLI-source breakdown", async () => {
    const queue: D1Queue = {
      firsts: [{ handle: "owner" }],
      alls: [
        {
          results: [
            { source: "claude-code", n: 17 },
            { source: "cursor", n: 4 },
          ],
        },
      ],
      preparedSql: [],
    };

    const app = makeApp({
      DB: makeD1(queue),
      SESSION_SIGNING_KEY: SIGNING_KEY,
      ADMIN_GITHUB_LOGIN: "owner",
    });

    const res = await app.fetch(await signedReq("/v1/admin/referrers", "user-1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      tracked: boolean;
      signal: string;
      rows: { label: string; count: number }[];
    };

    expect(body.tracked).toBe(false);
    expect(body.signal).toMatch(/CLI source/i);
    expect(body.rows).toEqual([
      { label: "claude-code", count: 17 },
      { label: "cursor", count: 4 },
    ]);
  });

  it("returns an empty rows array when there are no qualifying sessions", async () => {
    const queue: D1Queue = {
      firsts: [{ handle: "owner" }],
      alls: [{ results: [] }],
      preparedSql: [],
    };
    const app = makeApp({
      DB: makeD1(queue),
      SESSION_SIGNING_KEY: SIGNING_KEY,
      ADMIN_GITHUB_LOGIN: "owner",
    });

    const res = await app.fetch(await signedReq("/v1/admin/referrers", "user-1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tracked: boolean; rows: unknown[] };
    expect(body.tracked).toBe(false);
    expect(body.rows).toEqual([]);
  });
});
