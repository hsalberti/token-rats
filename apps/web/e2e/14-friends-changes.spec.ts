import { createHmac, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { skipReleaseGuide } from "./_setup/release-guide";
test.beforeEach(async ({ request }) => skipReleaseGuide(request));
function token(user: string) {
  const payload = `${user}.${Date.now() + 3600000}`;
  return `${payload}.${createHmac("sha256", "social-local-test-only").update(payload).digest("base64url")}`;
}
test("friends see inline diffs and kudos; owners can pause and resume capture", async ({
  page,
  context,
  request,
  browser,
  baseURL,
}, info) => {
  test.skip(process.env.TOKEN_RATS_SOCIAL_E2E !== "1", "Requires isolated social test database");
  test.setTimeout(120000);
  const api = process.env.PLAYWRIGHT_API_BASE_URL ?? "http://127.0.0.1:8788";
  const alice = { Authorization: `Bearer ${token("social-alice")}` };
  const bob = { Authorization: `Bearer ${token("social-bob")}` };
  await request.put(`${api}/v1/setups/follow/social-bob`, { headers: alice });
  await request.put(`${api}/v1/setups/follow/social-alice`, { headers: bob });
  const id = randomUUID();
  const label = `Test ${info.project.name} ${id.slice(0, 8)}`;
  const line = `Review the diff before shipping. ${id.slice(0, 8)}`;
  const registered = await request.post(`${api}/v1/setups/watchers`, {
    headers: alice,
    data: {
      id,
      deviceId: `e2e-${id}`,
      label,
      content: "# Instructions\nAlways delegate small fixes.\n",
    },
  });
  expect(registered.status()).toBe(201);
  const { watcher } = await registered.json();
  const changed = await request.post(`${api}/v1/setups/watchers/${id}/sync`, {
    headers: alice,
    data: { content: `# Instructions\n${line}\n` },
  });
  expect(changed.ok()).toBe(true);
  const { versionId } = await changed.json();
  await context.addCookies([{ name: "tr_session", value: token("social-bob"), url: baseURL! }]);
  await page.goto("/app");
  const post = page
    .getByRole("article", { name: "Change by @social-alice" })
    .filter({ hasText: line });
  await expect(post.getByText(line, { exact: true })).toBeVisible();
  await expect(post.getByText("Always delegate small fixes.", { exact: true })).toBeVisible();
  await expect(post.getByText("Friends only", { exact: true })).toBeVisible();
  await expect(post.getByLabel("Added", { exact: true })).toBeVisible();
  await expect(post.getByLabel("Removed", { exact: true })).toBeVisible();
  const kudos = post.getByRole("button", { name: "Kudos 0", exact: true });
  await kudos.click();
  await expect(post.getByRole("button", { name: "Kudos given 1", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.reload();
  await expect(post.getByRole("button", { name: "Kudos given 1", exact: true })).toBeVisible();
  await page.screenshot({
    path: `/tmp/token-rats-friends-feed-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Discover", exact: true }).click();
  await expect(page.getByText(line, { exact: true })).toHaveCount(0);
  expect((await request.get(`${baseURL}/cards/setups/${versionId}`)).status()).toBe(404);
  expect((await request.get(`${api}/v1/u/social-alice/share?version=${versionId}`)).status()).toBe(
    404,
  );
  await page.goto("/app/friends");
  await expect(page.getByText("Friend · you follow each other", { exact: true })).toBeVisible();
  const ownerContext = await browser.newContext({ baseURL, viewport: info.project.use.viewport });
  await ownerContext.addCookies([
    { name: "tr_session", value: token("social-alice"), url: baseURL! },
  ]);
  const owner = await ownerContext.newPage();
  await owner.goto("/app/setups#automatic");
  const capture = owner.getByRole("region", { name: "Automatic capture", exact: true });
  const source = capture.getByRole("listitem").filter({ hasText: label });
  await source.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(
    source.getByText("Paused · saved history keeps its audience", { exact: true }),
  ).toBeVisible();
  await source.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(source.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await owner.screenshot({
    path: `/tmp/token-rats-automatic-${info.project.name}.png`,
    fullPage: true,
  });
  await request.delete(`${api}/v1/setups/follow/social-bob`, { headers: alice });
  await page.goto(`/setups/${watcher.setupId}?v=${versionId}`);
  await expect(page.getByRole("heading", { name: "Page not found", exact: true })).toBeVisible();
  await ownerContext.close();
});
