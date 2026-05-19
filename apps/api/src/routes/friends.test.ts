/**
 * Unit tests for v1.2 Track AD — derived friends from shared private rooms.
 *
 * Exercises the friends route end-to-end through Hono with an in-memory D1
 * stub. The stub only implements the SQL shapes this route uses — anything
 * else throws.
 */

import type { FriendsResponse } from "@token-rats/contracts";
import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import type { Env } from "../env.js";
import { signToken } from "../lib/auth.js";
import type { AuthVariables } from "../middleware/auth.js";
import friendsRoutes from "./friends.js";

/* -------------------------------------------------------------------------- */
/* In-memory D1 + KV stubs                                                     */
/* -------------------------------------------------------------------------- */

interface UserRow {
  id: string;
  handle: string;
  avatar_url: string | null;
  public_profile: number;
  twitter_handle: string | null;
  twitter_verified_at: number | null;
}
interface RoomRow {
  id: string;
  code: string;
  name: string;
  is_public: number;
}
interface MemberRow {
  room_id: string;
  user_id: string;
}
interface RollupRow {
  user_id: string;
  day: string; // YYYY-MM-DD
  tokens: number;
  cost_usd_cents: number;
  sessions: number;
}

interface Store {
  users: UserRow[];
  rooms: RoomRow[];
  members: MemberRow[];
  rollups: RollupRow[];
}

function newStore(): Store {
  return { users: [], rooms: [], members: [], rollups: [] };
}

function makeDb(store: Store): D1Database {
  function exec(sql: string, params: unknown[]) {
    const trimmed = sql.replace(/\s+/g, " ").trim();

    // Friends stats query — joins users, the private-room co-member subquery,
    // and an optional daily_rollup aggregate.
    if (
      trimmed.startsWith("SELECT u.id AS user_id, u.handle AS handle,") &&
      trimmed.includes("FROM users u JOIN (") &&
      trimmed.includes("LEFT JOIN daily_rollup dr")
    ) {
      const [selfA, selfB, ...rest] = params as string[];
      void selfB;
      const dayThreshold = rest[0]; // undefined for "all"

      // 1. Determine the caller's private room ids.
      const privateRoomIds = new Set(
        store.members
          .filter((m) => m.user_id === selfA)
          .map((m) => store.rooms.find((r) => r.id === m.room_id))
          .filter((r): r is RoomRow => !!r && (r.is_public ?? 0) === 0)
          .map((r) => r.id),
      );

      // 2. Friend ids = other users in those rooms.
      const friendIds = new Set<string>();
      for (const m of store.members) {
        if (privateRoomIds.has(m.room_id) && m.user_id !== selfA) friendIds.add(m.user_id);
      }

      // 3. Aggregate stats per friend within the window.
      const rows = [...friendIds].map((uid) => {
        const u = store.users.find((x) => x.id === uid);
        if (!u) return null;
        const matching = store.rollups.filter((r) => {
          if (r.user_id !== uid) return false;
          if (dayThreshold === undefined) return true;
          if (trimmed.includes("AND dr.day = ?")) return r.day === dayThreshold;
          // "AND dr.day >= ?"
          return r.day >= (dayThreshold as string);
        });
        const tokens = matching.reduce((s, r) => s + r.tokens, 0);
        const cost = matching.reduce((s, r) => s + r.cost_usd_cents, 0);
        const sessions = matching.reduce((s, r) => s + r.sessions, 0);
        return {
          user_id: u.id,
          handle: u.handle,
          avatar_url: u.avatar_url,
          public_profile: u.public_profile,
          twitter_handle: u.twitter_verified_at !== null ? u.twitter_handle : null,
          tokens,
          cost_usd_cents: cost,
          sessions,
        };
      });

      const sorted = rows
        .filter((r): r is NonNullable<typeof r> => r !== null)
        .sort((a, b) => {
          if (b.cost_usd_cents !== a.cost_usd_cents) return b.cost_usd_cents - a.cost_usd_cents;
          if (b.tokens !== a.tokens) return b.tokens - a.tokens;
          return a.handle.localeCompare(b.handle);
        });

      return { first: sorted[0] ?? null, all: sorted, changes: 0 };
    }

    // Shared-rooms query — given (selfId, ...friendIds), returns rooms in
    // common, one row per (friend, room).
    if (
      trimmed.startsWith("SELECT rm_friend.user_id AS friend_id, r.code AS code, r.name AS name") &&
      trimmed.includes("WHERE COALESCE(r.is_public, 0) = 0")
    ) {
      const [selfId, ...friendIds] = params as string[];
      const privateRoomIds = new Set(
        store.members
          .filter((m) => m.user_id === selfId)
          .map((m) => store.rooms.find((r) => r.id === m.room_id))
          .filter((r): r is RoomRow => !!r && (r.is_public ?? 0) === 0)
          .map((r) => r.id),
      );
      const out: { friend_id: string; code: string; name: string }[] = [];
      for (const fid of friendIds) {
        for (const m of store.members) {
          if (m.user_id !== fid) continue;
          if (!privateRoomIds.has(m.room_id)) continue;
          const room = store.rooms.find((r) => r.id === m.room_id);
          if (!room) continue;
          out.push({ friend_id: fid, code: room.code, name: room.name });
        }
      }
      out.sort((a, b) => a.name.localeCompare(b.name));
      return { first: out[0] ?? null, all: out, changes: 0 };
    }

    throw new Error(`Unmocked SQL: ${trimmed}`);
  }

  function makeStmt(sql: string, boundParams: unknown[] = []): D1PreparedStatement {
    const stmt = {
      bind(...args: unknown[]) {
        return makeStmt(sql, args);
      },
      async first<T>() {
        const r = exec(sql, boundParams);
        return r.first as T;
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
    };
    return stmt as unknown as D1PreparedStatement;
  }

  return {
    prepare(sql: string) {
      return makeStmt(sql);
    },
    async batch() {
      return [];
    },
  } as unknown as D1Database;
}

function makeKv(): KVNamespace {
  const store = new Map<string, string>();
  return {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
  } as unknown as KVNamespace;
}

/* -------------------------------------------------------------------------- */
/* Harness                                                                     */
/* -------------------------------------------------------------------------- */

const TEST_SIGNING_KEY = "test-signing-key-for-friends-tests";

function makeApp(store: Store) {
  type HonoEnv = { Bindings: Env; Variables: AuthVariables };
  const app = new Hono<HonoEnv>();
  app.route("/v1/me", friendsRoutes);

  const env = {
    DB: makeDb(store),
    CACHE: makeKv(),
    SESSION_SIGNING_KEY: TEST_SIGNING_KEY,
  } as unknown as Env;

  return async (path: string, userId: string): Promise<Response> => {
    const token = await signToken(userId, TEST_SIGNING_KEY, 60_000);
    const headers = new Headers({ Cookie: `tr_session=${token}` });
    return app.fetch(new Request(`http://test${path}`, { method: "GET", headers }), env);
  };
}

function addUser(store: Store, id: string, handle: string, opts: Partial<UserRow> = {}) {
  store.users.push({
    id,
    handle,
    avatar_url: null,
    public_profile: 0,
    twitter_handle: null,
    twitter_verified_at: null,
    ...opts,
  });
}
function addRoom(store: Store, id: string, code: string, name: string, isPublic = false) {
  store.rooms.push({ id, code, name, is_public: isPublic ? 1 : 0 });
}
function addMember(store: Store, roomId: string, userId: string) {
  store.members.push({ room_id: roomId, user_id: userId });
}
function addRollup(
  store: Store,
  userId: string,
  day: string,
  tokens: number,
  costCents: number,
  sessions = 1,
) {
  store.rollups.push({ user_id: userId, day, tokens, cost_usd_cents: costCents, sessions });
}

/* -------------------------------------------------------------------------- */
/* Tests                                                                       */
/* -------------------------------------------------------------------------- */

describe("GET /v1/me/friends", () => {
  let store: Store;
  let fetcher: ReturnType<typeof makeApp>;

  beforeEach(() => {
    store = newStore();
    fetcher = makeApp(store);
  });

  it("returns an empty list when the user is in no rooms", async () => {
    addUser(store, "u1", "alice");

    const res = await fetcher("/v1/me/friends?range=7d", "u1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as FriendsResponse;
    expect(body.range).toBe("7d");
    expect(body.friends).toEqual([]);
  });

  it("returns co-members of a single shared private room", async () => {
    addUser(store, "u1", "alice");
    addUser(store, "u2", "bob");
    addUser(store, "u3", "carol");
    addRoom(store, "r1", "devclub", "devclub");
    addMember(store, "r1", "u1");
    addMember(store, "r1", "u2");
    addMember(store, "r1", "u3");

    const today = new Date().toISOString().slice(0, 10);
    addRollup(store, "u2", today, 100, 50);
    addRollup(store, "u3", today, 300, 200);

    const res = await fetcher("/v1/me/friends?range=7d", "u1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as FriendsResponse;

    expect(body.friends.map((f) => f.handle)).toEqual(["carol", "bob"]);

    const bob = body.friends.find((f) => f.handle === "bob");
    expect(bob).toBeDefined();
    expect(bob?.sharedRooms).toEqual([{ code: "devclub", name: "devclub" }]);
    expect(bob?.tokens).toBe(100);
    expect(bob?.costUsdCents).toBe(50);

    const carol = body.friends.find((f) => f.handle === "carol");
    expect(carol?.sharedRooms).toEqual([{ code: "devclub", name: "devclub" }]);
    // Caller themselves never appears.
    expect(body.friends.find((f) => f.handle === "alice")).toBeUndefined();
  });

  it("deduplicates friends across multiple shared rooms and lists every shared room", async () => {
    addUser(store, "u1", "alice");
    addUser(store, "u2", "bob");
    addRoom(store, "r1", "devclub", "devclub");
    addRoom(store, "r2", "sf-team", "sf-team");
    addMember(store, "r1", "u1");
    addMember(store, "r1", "u2");
    addMember(store, "r2", "u1");
    addMember(store, "r2", "u2");

    const res = await fetcher("/v1/me/friends?range=all", "u1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as FriendsResponse;

    expect(body.friends).toHaveLength(1);
    const bob = body.friends[0];
    expect(bob?.handle).toBe("bob");
    expect(bob?.sharedRooms.map((r) => r.code).sort()).toEqual(["devclub", "sf-team"]);
  });

  it("excludes public rooms from the friend graph", async () => {
    addUser(store, "u1", "alice");
    addUser(store, "u2", "stranger");
    // Only a public room ties them together — stranger should NOT be a friend.
    addRoom(store, "rPub", "global-br", "global-br", true);
    addMember(store, "rPub", "u1");
    addMember(store, "rPub", "u2");

    const res = await fetcher("/v1/me/friends?range=7d", "u1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as FriendsResponse;
    expect(body.friends).toEqual([]);
  });

  it("range filter changes the tokens/cost numbers", async () => {
    addUser(store, "u1", "alice");
    addUser(store, "u2", "bob");
    addRoom(store, "r1", "devclub", "devclub");
    addMember(store, "r1", "u1");
    addMember(store, "r1", "u2");

    const today = new Date().toISOString().slice(0, 10);
    const oldDay = "2020-01-01";
    addRollup(store, "u2", today, 100, 50);
    addRollup(store, "u2", oldDay, 9000, 9999);

    const res7d = await fetcher("/v1/me/friends?range=7d", "u1");
    const body7d = (await res7d.json()) as FriendsResponse;
    expect(body7d.friends[0]?.tokens).toBe(100);
    expect(body7d.friends[0]?.costUsdCents).toBe(50);

    const resAll = await fetcher("/v1/me/friends?range=all", "u1");
    const bodyAll = (await resAll.json()) as FriendsResponse;
    expect(bodyAll.friends[0]?.tokens).toBe(9100);
    expect(bodyAll.friends[0]?.costUsdCents).toBe(10049);
  });

  it("only surfaces a verified twitterHandle", async () => {
    addUser(store, "u1", "alice");
    addUser(store, "u2", "bob", { twitter_handle: "bob_unverified" });
    addUser(store, "u3", "carol", {
      twitter_handle: "carol_verified",
      twitter_verified_at: Date.now(),
    });
    addRoom(store, "r1", "devclub", "devclub");
    addMember(store, "r1", "u1");
    addMember(store, "r1", "u2");
    addMember(store, "r1", "u3");

    const res = await fetcher("/v1/me/friends?range=all", "u1");
    const body = (await res.json()) as FriendsResponse;
    const bob = body.friends.find((f) => f.handle === "bob");
    const carol = body.friends.find((f) => f.handle === "carol");
    expect(bob?.twitterHandle ?? null).toBeNull();
    expect(carol?.twitterHandle).toBe("carol_verified");
  });
});
