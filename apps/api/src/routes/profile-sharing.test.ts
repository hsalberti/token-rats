import { Hono } from "hono";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { Env } from "../env.js";
import { signToken } from "../lib/auth.js";
import { testDatabase } from "../lib/test-db.js";
import type { AuthVariables } from "../middleware/auth.js";
import me from "./me.js";
import profiles from "./profiles.js";

let setup: ReturnType<typeof testDatabase>;
const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
app.route("/me", me);
app.route("/u", profiles);
beforeEach(() => {
  setup = testDatabase();
});
afterEach(() => setup.db.close());

async function patch(body: unknown) {
  const token = await signToken("alice", setup.env.SESSION_SIGNING_KEY, 3600000);
  return app.request(
    "https://test/me",
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    setup.env,
  );
}
it("keeps legacy saved instructions private after moving publication to setup versions", async () => {
  const instructions = `${"Public preview\n".repeat(10)}Private draft line`;
  expect((await patch({ publicProfile: true, agentInstructions: instructions })).status).toBe(200);
  const read = () => app.request("https://test/u/alice", {}, setup.env);
  const before = (await (await read()).json()) as {
    profile: { agentInstructions: string | null; agentInstructionsPreview: string };
  };
  expect(before.profile.agentInstructions).toBeNull();
  expect(before.profile.agentInstructionsPreview).toBeNull();
  expect(
    (
      await patch({
        publishAgentInstructions: true,
        agentWorkflow: "Planner delegates to implementers.",
      })
    ).status,
  ).toBe(200);
  expect(await (await read()).json()).toMatchObject({
    profile: {
      agentInstructions: null,
      agentWorkflow: null,
    },
  });
  expect((await patch({ publicProfile: false })).status).toBe(200);
  expect((await read()).status).toBe(404);
});

it("saves categorized favorites, publishes them, and respects profile privacy", async () => {
  const profileFavorites = [
    { id: "model:claude-opus", category: "model" },
    { id: "provider:anthropic", category: "provider" },
    { id: "software:paseo", category: "software" },
    { id: "subscription:claude-max", category: "subscription" },
  ];
  const response = await patch({ publicProfile: true, profileFavorites });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ user: { profileFavorites } });
  const read = () => app.request("https://test/u/alice", {}, setup.env);
  expect(await (await read()).json()).toMatchObject({ profile: { profileFavorites } });
  expect(
    (await patch({ profileFavorites: [{ id: "model:claude", category: "provider" }] })).status,
  ).toBe(400);
  expect(await (await read()).json()).toMatchObject({ profile: { profileFavorites } });
  expect((await patch({ profileFavorites: [] })).status).toBe(200);
  expect(await (await read()).json()).toMatchObject({ profile: { profileFavorites: [] } });
  await patch({ publicProfile: false, profileFavorites });
  expect((await read()).status).toBe(404);
});
