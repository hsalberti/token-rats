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
it("publishes full instructions only after explicit opt-in and respects profile privacy", async () => {
  const instructions = `${"Public preview\n".repeat(10)}Private draft line`;
  expect((await patch({ publicProfile: true, agentInstructions: instructions })).status).toBe(200);
  const read = () => app.request("https://test/u/alice", {}, setup.env);
  const before = (await (await read()).json()) as {
    profile: { agentInstructions: string | null; agentInstructionsPreview: string };
  };
  expect(before.profile.agentInstructions).toBeNull();
  expect(before.profile.agentInstructionsPreview).not.toContain("Private draft line");
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
      agentInstructions: instructions,
      agentWorkflow: "Planner delegates to implementers.",
    },
  });
  expect((await patch({ publicProfile: false })).status).toBe(200);
  expect((await read()).status).toBe(404);
});
