/**
 * Unit tests for v1.2 Track AE — public country-locked groups.
 *
 * Exercises rooms.ts + groups.ts end-to-end through Hono with an in-memory
 * D1 stub + KV stub. The stub only implements the SQL shapes these tests
 * touch; new SQL means a new branch here.
 */

import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import type { Env } from "../env.js";
import { signToken } from "../lib/auth.js";
import type { AuthVariables } from "../middleware/auth.js";
import groupsRoutes from "./groups.js";
import roomsRoutes from "./rooms.js";

/* -------------------------------------------------------------------------- */
/* In-memory D1 + KV                                                           */
/* -------------------------------------------------------------------------- */

type RoomRow = {
  id: string;
  code: string;
  name: string;
  owner_id: string;
  org_id: string | null;
  created_at: number;
  is_public: number;
  country: string | null;
};

type MemberRow = { room_id: string; user_id: string; joined_at: number };
type UserRow = { id: string; handle: string };

interface Store {
  rooms: RoomRow[];
  members: MemberRow[];
  users: UserRow[];
}

function newStore(): Store {
  return { rooms: [], members: [], users: [] };
}

class MockKV {
  store = new Map<string, string>();
  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }
  async put(key: string, value: string, _opts?: { expirationTtl?: number }): Promise<void> {
    this.store.set(key, value);
  }
  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}

function makeDb(store: Store): D1Database {
  function exec(sql: string, params: unknown[]) {
    const trimmed = sql.replace(/\s+/g, " ").trim();

    // --- rooms reads ---------------------------------------------------------

    if (
      /^SELECT id, code, name, owner_id, org_id, created_at, is_public, country FROM rooms WHERE code = \?$/.test(
        trimmed,
      )
    ) {
      const row = store.rooms.find((r) => r.code === params[0]);
      return { first: row ?? null, all: [], changes: 0 };
    }

    if (/^SELECT id, owner_id, is_public, country FROM rooms WHERE code = \?$/.test(trimmed)) {
      const row = store.rooms.find((r) => r.code === params[0]);
      if (!row) return { first: null, all: [], changes: 0 };
      return {
        first: {
          id: row.id,
          owner_id: row.owner_id,
          is_public: row.is_public,
          country: row.country,
        },
        all: [],
        changes: 0,
      };
    }

    if (/^SELECT id FROM rooms WHERE code = \?$/.test(trimmed)) {
      const row = store.rooms.find((r) => r.code === params[0]);
      return { first: row ? { id: row.id } : null, all: [], changes: 0 };
    }

    // --- rooms inserts/updates ----------------------------------------------

    if (/^INSERT INTO rooms \(/.test(trimmed)) {
      // Production SQL hardcodes org_id as NULL, so only 7 bind params arrive.
      const [id, code, name, ownerId, createdAt, isPublic, country] = params as [
        string,
        string,
        string,
        string,
        number,
        number,
        string | null,
      ];
      store.rooms.push({
        id,
        code,
        name,
        owner_id: ownerId,
        org_id: null,
        created_at: createdAt,
        is_public: isPublic,
        country,
      });
      return { first: null, all: [], changes: 1 };
    }

    if (/^UPDATE rooms SET name = \?, is_public = \?, country = \? WHERE id = \?$/.test(trimmed)) {
      const [name, isPublic, country, id] = params as [string, number, string | null, string];
      const row = store.rooms.find((r) => r.id === id);
      if (row) {
        row.name = name;
        row.is_public = isPublic;
        row.country = country;
      }
      return { first: null, all: [], changes: row ? 1 : 0 };
    }

    // --- room_members --------------------------------------------------------

    if (
      /^INSERT INTO room_members \(room_id, user_id, joined_at\) VALUES \(\?, \?, \?\)$/.test(
        trimmed,
      )
    ) {
      const [roomId, userId, joinedAt] = params as [string, string, number];
      store.members.push({ room_id: roomId, user_id: userId, joined_at: joinedAt });
      return { first: null, all: [], changes: 1 };
    }

    if (
      /^INSERT OR IGNORE INTO room_members \(room_id, user_id, joined_at\) VALUES \(\?, \?, \?\)$/.test(
        trimmed,
      )
    ) {
      const [roomId, userId, joinedAt] = params as [string, string, number];
      const exists = store.members.some((m) => m.room_id === roomId && m.user_id === userId);
      if (exists) return { first: null, all: [], changes: 0 };
      store.members.push({ room_id: roomId, user_id: userId, joined_at: joinedAt });
      return { first: null, all: [], changes: 1 };
    }

    if (/^SELECT 1 FROM room_members WHERE room_id = \? AND user_id = \?$/.test(trimmed)) {
      const [roomId, userId] = params as [string, string];
      const found = store.members.some((m) => m.room_id === roomId && m.user_id === userId);
      return { first: found ? { 1: 1 } : null, all: [], changes: 0 };
    }

    if (
      /^SELECT rm\.user_id, u\.handle, u\.avatar_url, rm\.joined_at FROM room_members rm JOIN users u ON u\.id = rm\.user_id WHERE rm\.room_id = \? ORDER BY rm\.joined_at ASC$/.test(
        trimmed,
      )
    ) {
      const roomId = params[0] as string;
      const rows = store.members
        .filter((m) => m.room_id === roomId)
        .map((m) => {
          const u = store.users.find((x) => x.id === m.user_id);
          return {
            user_id: m.user_id,
            handle: u?.handle ?? "",
            avatar_url: null,
            joined_at: m.joined_at,
          };
        });
      return { first: rows[0] ?? null, all: rows, changes: 0 };
    }

    // --- /v1/groups listing --------------------------------------------------

    if (
      /^SELECT r\.code\s+AS code,\s+r\.name\s+AS name,\s+r\.country\s+AS country,\s+r\.created_at\s+AS created_at,\s+COUNT\(rm\.user_id\) AS member_count FROM rooms r LEFT JOIN room_members rm ON rm\.room_id = r\.id WHERE r\.is_public = 1 AND UPPER\(r\.country\) = \? GROUP BY r\.id ORDER BY member_count DESC, r\.created_at DESC LIMIT \?$/.test(
        trimmed,
      )
    ) {
      const country = params[0] as string;
      const limit = params[1] as number;
      const rows = store.rooms
        .filter((r) => r.is_public === 1 && (r.country ?? "").toUpperCase() === country)
        .map((r) => ({
          code: r.code,
          name: r.name,
          country: r.country ?? "",
          created_at: r.created_at,
          member_count: store.members.filter((m) => m.room_id === r.id).length,
        }))
        .sort((a, b) =>
          a.member_count !== b.member_count
            ? b.member_count - a.member_count
            : b.created_at - a.created_at,
        )
        .slice(0, limit);
      return { first: rows[0] ?? null, all: rows, changes: 0 };
    }

    throw new Error(`Unmocked SQL: ${trimmed}`);
  }

  function makeStmt(sql: string, boundParams: unknown[] = []): D1PreparedStatement {
    return {
      bind(...args: unknown[]) {
        return makeStmt(sql, args);
      },
      async first<T>() {
        return exec(sql, boundParams).first as T;
      },
      async all<T>() {
        const r = exec(sql, boundParams);
        return { results: r.all as T[], success: true, meta: { changes: r.changes } };
      },
      async run() {
        const r = exec(sql, boundParams);
        return { success: true, meta: { changes: r.changes } };
      },
      async raw() {
        return [];
      },
    } as unknown as D1PreparedStatement;
  }

  return {
    prepare(sql: string) {
      return makeStmt(sql);
    },
    async batch(statements: D1PreparedStatement[]) {
      const out = [];
      for (const s of statements) out.push(await s.run());
      return out;
    },
  } as unknown as D1Database;
}

/* -------------------------------------------------------------------------- */
/* App harness                                                                 */
/* -------------------------------------------------------------------------- */

const TEST_SIGNING_KEY = "test-signing-key-for-groups-tests";

function makeApp(store: Store, kv: MockKV) {
  type HonoEnv = { Bindings: Env; Variables: AuthVariables };
  const app = new Hono<HonoEnv>();
  app.route("/v1/rooms", roomsRoutes);
  app.route("/v1/groups", groupsRoutes);

  const env = {
    DB: makeDb(store),
    CACHE: kv as unknown as KVNamespace,
    SESSION_SIGNING_KEY: TEST_SIGNING_KEY,
  } as unknown as Env;

  return async (
    path: string,
    init: RequestInit & { userId?: string; country?: string | null } = {},
  ): Promise<Response> => {
    const headers = new Headers(init.headers);
    if (init.userId) {
      const token = await signToken(init.userId, TEST_SIGNING_KEY, 60_000);
      headers.set("Cookie", `tr_session=${token}`);
    }
    if (init.country !== undefined && init.country !== null) {
      headers.set("cf-ipcountry", init.country);
    }
    return app.fetch(new Request(`http://test${path}`, { ...init, headers }), env);
  };
}

/* -------------------------------------------------------------------------- */
/* Tests                                                                       */
/* -------------------------------------------------------------------------- */

describe("v1.2 Track AE — public country-locked groups", () => {
  let store: Store;
  let kv: MockKV;
  let fetcher: ReturnType<typeof makeApp>;

  beforeEach(() => {
    store = newStore();
    kv = new MockKV();
    store.users.push({ id: "user-br", handle: "alice-br" });
    store.users.push({ id: "user-br2", handle: "bob-br" });
    store.users.push({ id: "user-us", handle: "carol-us" });
    fetcher = makeApp(store, kv);
  });

  it("rejects creating a public room when cf-ipcountry doesn't match", async () => {
    const res = await fetcher("/v1/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "BR Builders", isPublic: true, country: "BR" }),
      userId: "user-us",
      country: "US",
    });
    expect(res.status).toBe(400);
    // No row should have been inserted.
    expect(store.rooms).toHaveLength(0);
  });

  it("rejects creating a public room without a country", async () => {
    const res = await fetcher("/v1/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Stealth", isPublic: true }),
      userId: "user-br",
      country: "BR",
    });
    expect(res.status).toBe(400);
  });

  it("creates a public room when cf-ipcountry matches and surfaces it on /v1/groups", async () => {
    const create = await fetcher("/v1/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "BR Builders", isPublic: true, country: "BR" }),
      userId: "user-br",
      country: "BR",
    });
    expect(create.status).toBe(201);
    const created = (await create.json()) as {
      room: { code: string; isPublic: boolean; country: string };
    };
    expect(created.room.isPublic).toBe(true);
    expect(created.room.country).toBe("BR");

    // BR viewer sees it.
    const brList = await fetcher("/v1/groups", { country: "BR" });
    expect(brList.status).toBe(200);
    const brBody = (await brList.json()) as {
      viewerCountry: string | null;
      groups: Array<{ code: string; country: string; memberCount: number }>;
    };
    expect(brBody.viewerCountry).toBe("BR");
    expect(brBody.groups).toHaveLength(1);
    expect(brBody.groups[0]?.code).toBe(created.room.code);
    expect(brBody.groups[0]?.country).toBe("BR");
    expect(brBody.groups[0]?.memberCount).toBe(1);
  });

  it("US viewer sees no BR rooms on /v1/groups", async () => {
    // Seed a BR public room directly.
    await fetcher("/v1/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "BR Builders", isPublic: true, country: "BR" }),
      userId: "user-br",
      country: "BR",
    });

    const usList = await fetcher("/v1/groups", { country: "US" });
    expect(usList.status).toBe(200);
    const usBody = (await usList.json()) as {
      viewerCountry: string;
      groups: Array<{ code: string }>;
    };
    expect(usBody.viewerCountry).toBe("US");
    expect(usBody.groups).toHaveLength(0);
  });

  it("returns viewerCountry=null + empty groups when cf-ipcountry is missing", async () => {
    await fetcher("/v1/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "BR Builders", isPublic: true, country: "BR" }),
      userId: "user-br",
      country: "BR",
    });

    const noHeader = await fetcher("/v1/groups");
    expect(noHeader.status).toBe(200);
    const body = (await noHeader.json()) as {
      viewerCountry: string | null;
      groups: unknown[];
    };
    expect(body.viewerCountry).toBeNull();
    expect(body.groups).toHaveLength(0);
  });

  it("rejects join with 403 country_locked when joiner is from the wrong country", async () => {
    const create = await fetcher("/v1/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "BR Builders", isPublic: true, country: "BR" }),
      userId: "user-br",
      country: "BR",
    });
    const created = (await create.json()) as { room: { code: string } };

    const join = await fetcher(`/v1/rooms/${created.room.code}/join`, {
      method: "POST",
      userId: "user-us",
      country: "US",
    });
    expect(join.status).toBe(403);
    const body = (await join.json()) as {
      error: string;
      room_country: string;
      your_country: string | null;
    };
    expect(body.error).toBe("country_locked");
    expect(body.room_country).toBe("BR");
    expect(body.your_country).toBe("US");

    // Membership should NOT have been inserted.
    const member = store.members.find((m) => m.user_id === "user-us");
    expect(member).toBeUndefined();
  });

  it("allows join from matching country and busts the pg:{country} cache", async () => {
    const create = await fetcher("/v1/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "BR Builders", isPublic: true, country: "BR" }),
      userId: "user-br",
      country: "BR",
    });
    const created = (await create.json()) as { room: { code: string } };

    // Warm the cache.
    const list1 = await fetcher("/v1/groups", { country: "BR" });
    const body1 = (await list1.json()) as { groups: Array<{ memberCount: number }> };
    expect(body1.groups[0]?.memberCount).toBe(1);
    expect(kv.store.has("pg:BR")).toBe(true);

    // Same-country join succeeds and busts the cache.
    const join = await fetcher(`/v1/rooms/${created.room.code}/join`, {
      method: "POST",
      userId: "user-br2",
      country: "BR",
    });
    expect(join.status).toBe(200);
    expect(kv.store.has("pg:BR")).toBe(false);

    // Next list reflects the new member count.
    const list2 = await fetcher("/v1/groups", { country: "BR" });
    const body2 = (await list2.json()) as { groups: Array<{ memberCount: number }> };
    expect(body2.groups[0]?.memberCount).toBe(2);
  });

  it("non-public rooms are joinable from any country (no country check)", async () => {
    const create = await fetcher("/v1/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Stealth" }),
      userId: "user-br",
      country: "BR",
    });
    const created = (await create.json()) as { room: { code: string; isPublic: boolean } };
    expect(created.room.isPublic).toBe(false);

    const join = await fetcher(`/v1/rooms/${created.room.code}/join`, {
      method: "POST",
      userId: "user-us",
      country: "US",
    });
    expect(join.status).toBe(200);
  });

  it("rejects creating a public room when cf-ipcountry is missing", async () => {
    const res = await fetcher("/v1/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "BR Builders", isPublic: true, country: "BR" }),
      userId: "user-br",
      // no country
    });
    expect(res.status).toBe(400);
  });

  it("PATCH can flip is_public from false→true when country matches", async () => {
    const create = await fetcher("/v1/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Stealth" }),
      userId: "user-br",
      country: "BR",
    });
    const created = (await create.json()) as { room: { code: string } };

    const patch = await fetcher(`/v1/rooms/${created.room.code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPublic: true, country: "BR" }),
      userId: "user-br",
      country: "BR",
    });
    expect(patch.status).toBe(200);
    const body = (await patch.json()) as { room: { isPublic: boolean; country: string } };
    expect(body.room.isPublic).toBe(true);
    expect(body.room.country).toBe("BR");
  });
});
