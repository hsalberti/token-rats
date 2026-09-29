import type { SetupFeed } from "@token-rats/contracts";
import { Hono } from "hono";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { Env } from "../env.js";
import { signToken } from "../lib/auth.js";
import { testDatabase } from "../lib/test-db.js";
import type { AuthVariables } from "../middleware/auth.js";
import profiles from "./profiles.js";
import setups from "./setups.js";
import social from "./social.js";

let fixture: ReturnType<typeof testDatabase>;
const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
app.route("/setups", setups);
app.route("/social", social);
app.route("/u", profiles);
beforeEach(() => {
  fixture = testDatabase();
  for (const [i, user] of ["carol", "dave"].entries())
    fixture.db
      .prepare("INSERT INTO users(id,github_id,handle,created_at) VALUES(?,?,?,0)")
      .run(user, 10 + i, user);
  fixture.db.prepare("UPDATE users SET public_profile=1").run();
});
afterEach(() => fixture.db.close());
async function request(path: string, user = "alice", method = "GET", body?: unknown) {
  return app.request(
    `https://test${path}`,
    {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(user
          ? {
              Authorization: `Bearer ${await signToken(user, fixture.env.SESSION_SIGNING_KEY, 3600000)}`,
            }
          : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    },
    fixture.env,
  );
}
const snapshot = (content: string, visibility = "friends") => ({
  name: "Global instructions",
  bundle: { files: [{ name: "AGENTS.md", content }] },
  visibility,
});
async function create(content = "Keep changes small.", visibility = "friends") {
  const result = await request("/setups", "alice", "POST", snapshot(content, visibility));
  expect(result.status).toBe(201);
  return (await result.json()) as { id: string; versionId: string };
}
async function mutual() {
  await request("/setups/follow/alice", "bob", "PUT");
  await request("/setups/follow/bob", "alice", "PUT");
}
function board(id: string, member: string, isPublic: boolean) {
  fixture.db
    .prepare("INSERT INTO rooms(id,code,name,owner_id,created_at,is_public) VALUES(?,?,?,?,0,?)")
    .run(id, id, id, "alice", +isPublic);
  for (const user of ["alice", member])
    fixture.db
      .prepare("INSERT INTO room_members(room_id,user_id,joined_at) VALUES(?,?,0)")
      .run(id, user);
}

it("shares private-profile changes only with mutual follows or private-board friends; revokes every read when friendship ends", async () => {
  await mutual();
  board("private-board", "carol", false);
  board("public-board", "dave", true);
  await request("/setups/follow/alice", "moderator", "PUT");
  fixture.db.prepare("UPDATE users SET public_profile=0 WHERE id='alice'").run();
  const saved = await create("FRIENDS INSTRUCTIONS");
  for (const user of ["bob", "carol"]) {
    expect((await request(`/setups/${saved.id}`, user)).status).toBe(200);
    expect(await (await request("/setups/feed", user)).json()).toMatchObject({
      versions: [{ id: saved.versionId, visibility: "friends" }],
    });
    expect(await (await request("/setups/profile/alice", user)).json()).toMatchObject({
      friend: true,
      versions: [{ id: saved.versionId }],
    });
    expect(await (await request("/social/notifications", user)).json()).toMatchObject({
      unread: 1,
    });
  }
  for (const user of ["", "moderator", "dave"]) {
    expect((await request(`/setups/${saved.id}?v=${saved.versionId}`, user)).status).toBe(404);
    expect((await request(`/setups/versions/${saved.versionId}`, user)).status).toBe(404);
    expect(
      (await request(`/setups/versions/${saved.versionId}/copy`, user || "dave", "POST")).status,
    ).toBe(404);
  }
  expect(await (await request("/setups/feed?mode=discover", "bob")).json()).toMatchObject({
    versions: [],
  });
  expect(await (await request("/setups/people?friends=1", "alice")).json()).toMatchObject({
    people: [{ handle: "bob" }, { handle: "carol" }],
  });
  await request(`/setups/versions/${saved.versionId}/review`, "bob", "PUT", { status: "trying" });
  await request("/setups/follow/bob", "alice", "DELETE");
  fixture.db.prepare("DELETE FROM room_members WHERE user_id='carol'").run();
  for (const user of ["bob", "carol"]) {
    expect((await request(`/setups/${saved.id}`, user)).status).toBe(404);
    expect(await (await request("/setups/feed", user)).json()).toMatchObject({ versions: [] });
    expect(await (await request("/setups/library", user)).json()).toMatchObject({ versions: [] });
    expect(await (await request("/social/notifications", user)).json()).toMatchObject({
      unread: 0,
    });
  }
});

it("diffs only against readable history and never puts friends-only instructions in public profile cards", async () => {
  await mutual();
  const first = await create("OLD PRIVATE DETAIL", "private");
  const shared = (await (
    await request(`/setups/${first.id}/versions`, "alice", "POST", {
      ...snapshot("Keep changes small.\nAsk for review.", "public"),
      baseVersionId: first.versionId,
    })
  ).json()) as { versionId: string };
  const friends = (await (
    await request(`/setups/${first.id}/versions`, "alice", "POST", {
      ...snapshot("FRIENDS PRIVATE LINE"),
      baseVersionId: shared.versionId,
    })
  ).json()) as { versionId: string };
  const final = (await (
    await request(`/setups/${first.id}/versions`, "alice", "POST", {
      ...snapshot("Keep changes small.\nRun tests.", "public"),
      baseVersionId: friends.versionId,
    })
  ).json()) as { versionId: string };
  const feed = (await (await request("/setups/feed?mode=discover", "")).json()) as SetupFeed;
  const post = feed.versions.find((v) => v.id === final.versionId)!;
  expect(post.change).toMatchObject({ previousVersion: 2, additions: 1, deletions: 1 });
  expect(JSON.stringify(feed)).not.toMatch(/OLD PRIVATE DETAIL|FRIENDS PRIVATE LINE/);
  for (const user of ["", "alice", "bob"])
    expect((await request(`/u/alice/share?version=${friends.versionId}`, user)).status).toBe(404);
  expect(
    await (await request(`/setups/versions/${friends.versionId}`, "bob")).json(),
  ).toMatchObject({ version: { visibility: "friends" } });
});

it("toggles version-specific kudos idempotently and checks the current audience", async () => {
  await mutual();
  const saved = await create();
  const path = `/setups/versions/${saved.versionId}/kudos`;
  expect((await request(path, "alice", "PUT")).status).toBe(400);
  expect((await request(path, "carol", "PUT")).status).toBe(404);
  expect((await request(path, "", "PUT")).status).toBe(401);
  await request(path, "bob", "PUT");
  await request(path, "bob", "PUT");
  expect(await (await request(`/setups/${saved.id}`, "bob")).json()).toMatchObject({
    version: { kudosCount: 1, viewerHasKudos: true },
  });
  expect(await (await request(`/setups/${saved.id}`, "alice")).json()).toMatchObject({
    version: { kudosCount: 1, viewerHasKudos: false },
  });
  await request(path, "bob", "DELETE");
  await request(path, "bob", "DELETE");
  expect(await (await request(`/setups/${saved.id}`, "bob")).json()).toMatchObject({
    version: { kudosCount: 0, viewerHasKudos: false },
  });
  await request("/setups/follow/bob", "alice", "DELETE");
  expect((await request(path, "bob", "PUT")).status).toBe(404);
});

it("captures once per distinct content, honors pause/resume, and keeps automatic history friends-only", async () => {
  await mutual();
  fixture.db.prepare("UPDATE users SET public_profile=0 WHERE id='alice'").run();
  const id = crypto.randomUUID();
  const input = {
    id,
    deviceId: "test-device",
    label: "Codex global",
    content: "Review changes.\n",
  };
  const registered = await request("/setups/watchers", "alice", "POST", input);
  expect(registered.status).toBe(201);
  const { watcher } = (await registered.json()) as { watcher: { setupId: string } };
  expect((await request("/setups/watchers", "alice", "POST", input)).status).toBe(200);
  expect((await request("/setups/watchers", "bob", "POST", input)).status).toBe(404);
  expect(
    (
      await request("/setups/watchers", "alice", "POST", {
        ...input,
        id: crypto.randomUUID(),
        visibility: "public",
      })
    ).status,
  ).toBe(400);
  expect(
    await (
      await request(`/setups/watchers/${id}/sync`, "alice", "POST", { content: input.content })
    ).json(),
  ).toMatchObject({ changed: false });
  const concurrent = await Promise.all(
    [1, 2].map(() =>
      request(`/setups/watchers/${id}/sync`, "alice", "POST", {
        content: "Review changes.\nRun tests.\n",
      }),
    ),
  );
  expect(concurrent.every((r) => r.status === 200)).toBe(true);
  expect(
    fixture.db
      .prepare("SELECT count(*) AS n FROM setup_versions WHERE setup_id=?")
      .get(watcher.setupId),
  ).toEqual({ n: 2 });
  await request(`/setups/watchers/${id}`, "alice", "PUT", { enabled: false });
  expect(
    await (
      await request(`/setups/watchers/${id}/sync`, "alice", "POST", { content: "PAUSED CHANGE" })
    ).json(),
  ).toMatchObject({ changed: false });
  expect((await request(`/setups/watchers/${id}`, "bob", "PUT", { enabled: true })).status).toBe(
    404,
  );
  await request(`/setups/watchers/${id}`, "alice", "PUT", { enabled: true });
  const synced = (await (
    await request(`/setups/watchers/${id}/sync`, "alice", "POST", {
      content: "Review important changes.",
    })
  ).json()) as { versionId: string };
  const data = await (await request(`/setups/${watcher.setupId}`, "bob")).json();
  expect(data).toMatchObject({
    version: { automatic: true, visibility: "friends", number: 3 },
    history: [{ number: 3 }, { number: 2 }, { number: 1 }],
  });
  expect(
    (
      await request(`/setups/versions/${synced.versionId}/visibility`, "alice", "PUT", {
        visibility: "public",
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await request(`/setups/${watcher.setupId}/versions`, "alice", "POST", {
        ...snapshot("manual"),
        baseVersionId: synced.versionId,
      })
    ).status,
  ).toBe(400);
  await request(`/setups/versions/${synced.versionId}/visibility`, "alice", "PUT", {
    visibility: "private",
  });
  expect((await request(`/setups/versions/${synced.versionId}`, "bob")).status).toBe(404);
  await request(`/setups/watchers/${id}/sync`, "alice", "POST", { error: "File missing" });
  expect(await (await request("/setups/watchers", "alice")).json()).toMatchObject({
    watchers: [{ error: "File missing" }],
  });
  await request(`/setups/${watcher.setupId}`, "alice", "DELETE");
  expect(await (await request("/setups/watchers", "alice")).json()).toMatchObject({ watchers: [] });
});
