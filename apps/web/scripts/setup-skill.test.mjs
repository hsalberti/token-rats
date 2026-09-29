import assert from "node:assert/strict";
import { test } from "node:test";
import { saveSetup } from "../public/skills/share-token-rats-setup/scripts/save-setup.mjs";
const input = {
  name: "My setup",
  bundle: {
    files: [{ name: "AGENTS.md", content: "Run tests" }],
    workflow: "Review",
    tools: "Paseo",
    models: "Configured model",
    subscriptions: "",
  },
  note: "Trying it",
  verdict: "experiment",
};
function dependencies(responses) {
  const requests = [];
  return {
    requests,
    read: async () => JSON.stringify(input),
    loadToken: async () => "synthetic-session",
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return new Response(JSON.stringify(responses.shift()), { status: 200 });
    },
  };
}
test("dry run does not read a session or make requests", async () => {
  const result = await saveSetup(["setup.json", "--dry-run"], {
    read: async () => JSON.stringify(input),
    loadToken: () => {
      throw Error("must not read token");
    },
    fetchImpl: () => {
      throw Error("must not call");
    },
  });
  assert.equal(result.publication, "private");
  assert.deepEqual(result.files, ["AGENTS.md"]);
});
test("new snapshots default to private and credentials go only to the API", async () => {
  const deps = dependencies([{ versions: [] }, { id: "s", versionId: "v" }]);
  const result = await saveSetup(["setup.json"], deps);
  assert.equal(result.publication, "private");
  assert.equal(JSON.parse(deps.requests[1].options.body).visibility, "private");
  assert.equal(deps.requests[1].options.headers.Authorization, "Bearer synthetic-session");
  assert.ok(deps.requests.every((r) => new URL(r.url).origin === "https://api.tokenrats.com"));
  assert.equal(deps.requests[1].options.redirect, "error");
  assert.ok(!JSON.stringify(result).includes("synthetic-session"));
});
test("explicit publication updates the existing setup with its last version", async () => {
  const deps = dependencies([
    { versions: [{ setupId: "s", id: "old", name: "My setup", bundle: {}, note: "" }] },
    { id: "s", versionId: "new" },
  ]);
  await saveSetup(["setup.json", "--publish"], deps);
  assert.ok(deps.requests[1].url.endsWith("/s/versions"));
  assert.equal(JSON.parse(deps.requests[1].options.body).baseVersionId, "old");
  assert.equal(JSON.parse(deps.requests[1].options.body).visibility, "public");
});
test("an unchanged snapshot is not saved twice", async () => {
  const deps = dependencies([
    { versions: [{ ...input, setupId: "s", id: "v", visibility: "private" }] },
  ]);
  const result = await saveSetup(["setup.json"], deps);
  assert.equal(result.unchanged, true);
  assert.equal(deps.requests.length, 1);
});
test("friends sharing uses an explicit audience and updates identical private snapshots without duplicating", async () => {
  const deps = dependencies([
    { versions: [{ ...input, setupId: "s", id: "v", visibility: "private" }] },
    { visibility: "friends" },
  ]);
  const result = await saveSetup(["setup.json", "--friends"], deps);
  assert.equal(result.publication, "friends");
  assert.equal(result.unchanged, true);
  assert.ok(deps.requests[1].url.endsWith("/versions/v/visibility"));
  assert.equal(deps.requests[1].options.method, "PUT");
  assert.deepEqual(JSON.parse(deps.requests[1].options.body), { visibility: "friends" });
  await assert.rejects(
    saveSetup(["setup.json", "--friends", "--publish"], dependencies([])),
    /Choose one audience/,
  );
});
test("an ambiguous setup requires selection instead of creating another", async () => {
  const deps = dependencies([
    {
      versions: [
        { ...input, setupId: "s", id: "v" },
        { ...input, setupId: "other", id: "other-v" },
      ],
    },
  ]);
  await assert.rejects(saveSetup(["setup.json"], deps), /More than one/);
  assert.equal(deps.requests.length, 1);
});
test("a network interruption does not retry the mutation", async () => {
  let count = 0;
  const deps = dependencies([]);
  deps.fetchImpl = async () => {
    count++;
    if (count === 1) return new Response(JSON.stringify({ versions: [] }));
    throw Error("network");
  };
  await assert.rejects(saveSetup(["setup.json"], deps), /Check https/);
  assert.equal(count, 2);
});
