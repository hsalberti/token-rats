import type { ProfileShare } from "@token-rats/contracts";
import { Hono } from "hono";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Env } from "../env.js";
import { signToken } from "../lib/auth.js";
import { testDatabase } from "../lib/test-db.js";
import { DAY_MS, MONTH_MS } from "../lib/time.js";
import type { AuthVariables } from "../middleware/auth.js";
import profiles from "./profiles.js";
import setups from "./setups.js";

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
app.route("/u", profiles);
app.route("/setups", setups);
let fixture: ReturnType<typeof testDatabase>;
const now = Date.UTC(2026, 8, 29, 12);
beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(now);
  fixture = testDatabase();
  fixture.db.prepare("UPDATE users SET public_profile=1 WHERE id IN ('alice','bob')").run();
});
afterEach(() => {
  fixture.db.close();
  vi.restoreAllMocks();
});

async function request(path: string, method = "GET", body?: unknown, user?: string) {
  return app.request(
    `https://test${path}`,
    {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(user
          ? {
              Authorization: `Bearer ${await signToken(user, fixture.env.SESSION_SIGNING_KEY, DAY_MS)}`,
            }
          : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    },
    fixture.env,
  );
}
async function create(publish = true, user = "alice") {
  const response = await request(
    "/setups",
    "POST",
    {
      name: "My setup",
      publish,
      bundle: {
        files: [
          { name: "notes.md", content: "Other notes" },
          { name: "AGENTS.md", content: "First\r\nSecond\r\nThird\r\nFourth" },
        ],
      },
    },
    user,
  );
  expect(response.status).toBe(201);
  return (await response.json()) as { id: string; versionId: string };
}
function session(
  model: string,
  provider: string,
  tokens: number,
  timestamp = now - DAY_MS,
  user = "alice",
) {
  const id = crypto.randomUUID();
  fixture.db
    .prepare(`INSERT INTO sessions (id,user_id,source,provider,model,in_tokens,out_tokens,cost_usd_cents,started_at,ended_at,dedupe_key)
    VALUES (?,?,'codex',?,?,?,0,0,?,?,?)`)
    .run(id, user, provider, model, tokens, timestamp, timestamp, id);
}
async function share(query = "") {
  const response = await request(`/u/alice/share${query}`);
  expect(response.status).toBe(200);
  return ((await response.json()) as { share: ProfileShare }).share;
}

it("ranks models and their publishers by tokens in the same rolling 30-day window", async () => {
  session("gpt-5.3-codex", "openai", 80);
  session("gpt-5.3-codex", "cursor", 60);
  session("gpt-5.4", "openai", 20);
  session("claude-opus-4-6", "anthropic", 100);
  session("claude-opus-4-6", "anthropic", 10_000, now - MONTH_MS - 1);
  session("gpt-5.4", "openai", 10_000, now + 1);
  session("claude-opus-4-6", "anthropic", 10_000, now - DAY_MS, "bob");
  // The lower bound is inclusive; cache/reasoning subtotals are not added again.
  session("gpt-5.4", "openai", 5, now - MONTH_MS);
  expect(await share()).toMatchObject({
    tokens: 265,
    topModel: "gpt-5.3-codex",
    topProvider: "OpenAI",
    period: { start: now - MONTH_MS, end: now },
  });
});

it("uses the combined provider total, even if another provider has the top individual model", async () => {
  session("claude-opus-4-6", "anthropic", 100);
  session("gpt-5.3-codex", "openai", 70);
  session("gpt-5.4", "openai", 70);
  expect(await share()).toMatchObject({ topModel: "claude-opus-4-6", topProvider: "OpenAI" });
});

it("handles a profile with no usage or published instructions without inventing data", async () => {
  expect(await share()).toMatchObject({
    tokens: 0,
    topModel: null,
    topProvider: null,
    instructions: null,
  });
});

it("shares exact selected lines from the named published version and preserves them after edits", async () => {
  const first = await create();
  expect((await share()).instructions).toMatchObject({
    versionId: first.versionId,
    file: 1,
    fileName: "AGENTS.md",
  });
  const selection = `?version=${first.versionId}&file=1&start=2&end=3`;
  expect((await share(selection)).instructions?.text).toBe("Second\nThird");
  const next = await request(
    `/setups/${first.id}/versions`,
    "POST",
    {
      name: "My setup",
      publish: true,
      baseVersionId: first.versionId,
      bundle: { files: [{ name: "AGENTS.md", content: "Changed instructions" }] },
    },
    "alice",
  );
  expect(next.status).toBe(201);
  expect((await share(selection)).instructions?.text).toBe("Second\nThird");
  expect((await share()).instructions?.text).toBe("Changed instructions");
  expect(
    (
      await request(
        `/setups/${first.id}/versions`,
        "POST",
        {
          name: "Stale edit",
          publish: true,
          baseVersionId: first.versionId,
          bundle: { files: [{ name: "AGENTS.md", content: "Overwrite" }] },
        },
        "alice",
      )
    ).status,
  ).toBe(409);
});

it("never exposes private, unpublished, other-owner, or banned instructions through card URLs", async () => {
  const draft = await create(false);
  const other = await create(true, "bob");
  expect(
    (await request(`/u/alice/share?version=${draft.versionId}`, "GET", undefined, "alice")).status,
  ).toBe(404);
  expect((await request(`/u/alice/share?version=${other.versionId}`)).status).toBe(404);
  const published = await create();
  await request(`/setups/versions/${published.versionId}/publish`, "DELETE", undefined, "alice");
  expect((await request(`/u/alice/share?version=${published.versionId}`)).status).toBe(404);
  fixture.db.prepare("UPDATE users SET public_profile=0 WHERE id='alice'").run();
  expect((await request("/u/alice/share", "GET", undefined, "alice")).status).toBe(404);
  fixture.db.prepare("UPDATE users SET public_profile=1 WHERE id='alice'").run();
  await fixture.env.CACHE.put("banned:handle:alice", "yes");
  expect((await request("/u/alice/share")).status).toBe(404);
});

it("uses the profile's featured setup and latest published version, even after republishing old versions", async () => {
  const first = await create();
  const next = await request(
    `/setups/${first.id}/versions`,
    "POST",
    {
      name: "My setup",
      publish: true,
      baseVersionId: first.versionId,
      bundle: { files: [{ name: "AGENTS.md", content: "Current profile instructions" }] },
    },
    "alice",
  );
  expect(next.status).toBe(201);
  vi.mocked(Date.now).mockReturnValue(now + 60_000);
  await request(`/setups/versions/${first.versionId}/publish`, "DELETE", undefined, "alice");
  await request(`/setups/versions/${first.versionId}/publish`, "POST", undefined, "alice");
  expect((await share()).instructions?.text).toBe("Current profile instructions");
  vi.mocked(Date.now).mockReturnValue(now + 120_000);
  const other = await create();
  expect((await share()).instructions?.setupId).toBe(other.id);
  expect((await request(`/setups/${first.id}/feature`, "POST", undefined, "alice")).status).toBe(
    200,
  );
  expect((await share()).instructions).toMatchObject({
    setupId: first.id,
    text: "Current profile instructions",
  });
});

it("rejects invalid line selections and does not accept user-supplied replacement quotes", async () => {
  const version = await create();
  for (const selection of [
    "start=0",
    "start=3&end=2",
    "end=500",
    "file=9",
    "start=NaN",
    "file=-1",
  ]) {
    expect((await request(`/u/alice/share?version=${version.versionId}&${selection}`)).status).toBe(
      400,
    );
  }
  expect((await share("?text=Made%20up%20quote")).instructions?.text).toBe(
    "First\nSecond\nThird\nFourth",
  );
});
