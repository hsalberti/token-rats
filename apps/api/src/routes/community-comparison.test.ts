import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Env } from "../env.js";
import { signToken } from "../lib/auth.js";
import { recordSession } from "../lib/ingest.js";
import { testDatabase } from "../lib/test-db.js";
import type { AuthVariables } from "../middleware/auth.js";
import community from "./community.js";
import comparison from "./comparison.js";
let setup: ReturnType<typeof testDatabase>;
const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
app.route("/community", community);
app.route("/compare", comparison);
beforeEach(() => {
  setup = testDatabase();
});
afterEach(() => setup.db.close());
async function request(path: string, method = "GET", body?: unknown, user?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (user)
    headers.Authorization = `Bearer ${await signToken(user, setup.env.SESSION_SIGNING_KEY, 3600000)}`;
  return app.request(
    `https://test${path}`,
    { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) },
    setup.env,
  );
}
describe("community routes with production schema", () => {
  it("requires login to publish and validates posts", async () => {
    expect((await request("/community", "POST", {})).status).toBe(401);
    expect(
      (await request("/community", "POST", { kind: "idea", title: "a", body: "" }, "alice")).status,
    ).toBe(400);
  });
  it("publishes AGENTS.md as literal text and supports public replies", async () => {
    const body = "# Instructions\n<script>alert(1)</script>";
    const created = await request(
      "/community",
      "POST",
      { kind: "agents-md", title: "My agent instructions", body },
      "alice",
    );
    const { id } = (await created.json()) as { id: string };
    expect(created.status).toBe(201);
    expect(
      (await request(`/community/${id}/replies`, "POST", { body: "Thanks for the example" }, "bob"))
        .status,
    ).toBe(201);
    const thread = await (await request(`/community/${id}`)).json();
    expect(thread).toMatchObject({
      post: { body, replies: 1, handle: "alice" },
      replies: [{ handle: "bob" }],
    });
    expect((await request(`/community/${id}`, "DELETE", undefined, "bob")).status).toBe(403);
    expect((await request(`/community/${id}`, "DELETE", undefined, "moderator")).status).toBe(200);
    expect(setup.db.prepare("SELECT * FROM community_replies").all()).toEqual([]);
  });
  it("paginates and filters posts", async () => {
    for (let i = 0; i < 22; i++) {
      setup.db
        .prepare("INSERT INTO community_posts VALUES (?, 'alice', 'idea', 'Title', 'Body', ?)")
        .run(String(i), i);
    }
    const first = (await (await request("/community")).json()) as {
      posts: unknown[];
      nextOffset: number;
    };
    expect(first.posts).toHaveLength(20);
    expect(first.nextOffset).toBe(20);
    expect(await (await request("/community?offset=20")).json()).toMatchObject({
      nextOffset: null,
    });
    expect(await (await request("/community?kind=agents-md")).json()).toMatchObject({ posts: [] });
  });
});
describe("subscription comparison", () => {
  it("keeps month and user spending separate, including a zero-cost plan", async () => {
    expect((await request("/compare")).status).toBe(401);
    expect((await request("/compare?month=2026-13", "GET", undefined, "alice")).status).toBe(400);
    expect(
      (
        await request(
          "/compare/subscriptions",
          "PUT",
          { month: "2026-09", source: "codex", label: "My plan", paidUsdCents: 0 },
          "alice",
        )
      ).status,
    ).toBe(200);
    const read = async (user: string, month: string) =>
      (await (await request(`/compare?month=${month}`, "GET", undefined, user)).json()) as {
        sources: Array<{ source: string; subscription: unknown }>;
      };
    expect(
      (await read("alice", "2026-09")).sources.find((s) => s.source === "codex")?.subscription,
    ).toEqual({ label: "My plan", paidUsdCents: 0 });
    expect((await read("bob", "2026-09")).sources.every((s) => s.subscription === null)).toBe(true);
    expect((await read("alice", "2026-08")).sources.every((s) => s.subscription === null)).toBe(
      true,
    );
  });
  it("includes cache counts, flags unknown prices, and excludes proxy use", async () => {
    const base = {
      id: "c",
      source: "codex" as const,
      model: "not-priced",
      inTokens: 20,
      outTokens: 10,
      cacheReadTokens: 100,
      reasoningTokens: 5,
      costUsdCents: 0,
      startedAt: Date.parse("2026-09-01T12:00:00Z"),
      endedAt: Date.parse("2026-09-01T12:01:00Z"),
      dedupeKey: "c",
    };
    await recordSession(setup.env, "alice", base);
    await recordSession(setup.env, "alice", {
      ...base,
      id: "proxy",
      dedupeKey: "proxy",
      channel: "proxy",
      inTokens: 999999,
    });
    await recordSession(setup.env, "bob", {
      ...base,
      id: "bob",
      dedupeKey: "bob",
      inTokens: 888888,
    });
    const result = (await (
      await request("/compare?month=2026-09", "GET", undefined, "alice")
    ).json()) as { sources: unknown[] };
    expect(result.sources).toContainEqual(
      expect.objectContaining({
        source: "codex",
        sessions: 1,
        inTokens: 20,
        outTokens: 10,
        cacheReadTokens: 100,
        reasoningTokens: 5,
        unpricedSessions: 1,
      }),
    );
  });
});
