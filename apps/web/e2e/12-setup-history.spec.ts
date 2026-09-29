import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
import { skipReleaseGuide } from "./_setup/release-guide";
test.beforeEach(async ({ request }) => skipReleaseGuide(request));
function token(user: string) {
  const payload = `${user}.${Date.now() + 3600000}`;
  return `${payload}.${createHmac("sha256", "social-local-test-only").update(payload).digest("base64url")}`;
}
test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus)
    await page.screenshot({ path: `/tmp/social-failure-${info.project.name}.png`, fullPage: true });
});

test("save, publish, compare, restore, follow, rate and copy a setup", async ({
  page,
  context,
  browser,
  baseURL,
}, testInfo) => {
  test.skip(process.env.TOKEN_RATS_SOCIAL_E2E !== "1", "Requires the isolated social database.");
  test.setTimeout(120000);
  await context.addCookies([{ name: "tr_session", value: token("social-alice"), url: baseURL! }]);
  const name = `Review workflow ${testInfo.project.name} ${Date.now()}`;
  await page.goto("/setups/new");
  await page.getByLabel("Setup name", { exact: true }).fill(name);
  await page
    .getByLabel("Contents of AGENTS.md")
    .fill("# My instructions\nKeep changes small.\nPrivate draft details");
  await page.getByLabel("Favorite tools", { exact: true }).fill("Paseo · my custom review handler");
  await page.getByLabel("Subscriptions you choose to share").fill("My coding subscription");
  await page.getByRole("button", { name: "Save private version", exact: true }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  const privateUrl = page.url();
  await page.getByRole("link", { name: "Save a new version", exact: true }).click();
  await page
    .getByLabel("Contents of AGENTS.md")
    .fill("# My instructions\nAsk a separate reviewer to inspect the diff.");
  await page
    .getByLabel("What changed, or why did you move on?")
    .fill("Trying a separate reviewer; keeping the old experiment in history.");
  await page.getByLabel("Who can see this version?").selectOption("public");
  await page.getByRole("button", { name: "Share publicly", exact: true }).click();
  await expect(page.getByText("Public", { exact: true }).first()).toBeVisible();
  const publicUrl = page.url();
  await page.getByRole("button", { name: "Timeline (2)", exact: true }).click();
  await expect(page.getByText("− Private draft details", { exact: false })).toBeVisible();
  await page.screenshot({
    path: `/tmp/token-rats-social-timeline-${testInfo.project.name}.png`,
    fullPage: true,
  });
  const bob = await browser.newContext({ baseURL, viewport: testInfo.project.use.viewport });
  await bob.addCookies([{ name: "tr_session", value: token("social-bob"), url: baseURL! }]);
  const friend = await bob.newPage();
  await friend.goto(publicUrl);
  await expect(friend.getByRole("button", { name: "Timeline (1)", exact: true })).toBeVisible();
  await expect(friend.getByText("Private draft details", { exact: false })).toHaveCount(0);
  const follow = friend.getByRole("button", { name: "Follow @social-alice", exact: true });
  if (await follow.count()) await follow.click();
  await expect(
    friend.getByRole("button", { name: "Following @social-alice", exact: true }),
  ).toBeVisible();
  await friend.getByRole("button", { name: "Ratings & shelves (0)", exact: true }).click();
  await friend.getByLabel("Shelf status", { exact: true }).selectOption("dropped");
  await friend.getByLabel("Rating", { exact: true }).selectOption("2");
  await friend
    .getByLabel("A short note", { exact: true })
    .fill("More process than I needed for small fixes.");
  await friend.getByRole("button", { name: "Save to shelf", exact: true }).click();
  await expect(friend.getByText("Saved to your shelf.", { exact: true })).toBeVisible();
  await expect(
    friend.getByRole("heading", { name: "2.0 / 5 · 1 ratings", exact: true }),
  ).toBeVisible();
  await friend.getByRole("button", { name: "Use this version", exact: true }).click();
  await expect(friend.getByText("Only me", { exact: true }).first()).toBeVisible();
  await expect(friend.getByRole("link", { name: "Save a new version", exact: true })).toBeVisible();
  await page.goto(privateUrl);
  await page.getByRole("link", { name: "Restore as a new version", exact: true }).click();
  await page.getByRole("button", { name: "Save private version", exact: true }).click();
  await expect(page.getByText("Version 3 ·", { exact: false })).toBeVisible();
  await page.getByRole("link", { name: "Save a new version", exact: true }).click();
  await page
    .getByLabel("Contents of AGENTS.md")
    .fill("# My instructions\nReview changes that need another pair of eyes.");
  await page.getByLabel("Who can see this version?").selectOption("public");
  await page.getByRole("button", { name: "Share publicly", exact: true }).click();
  await expect(page.getByText("Version 4 ·", { exact: false })).toBeVisible();
  await friend.goto("/app");
  await expect(
    friend.getByRole("link", { name: `${name} · v4`, exact: true }).first(),
  ).toBeVisible();
  await friend.screenshot({
    path: `/tmp/token-rats-social-feed-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await friend.goto("/app/notifications");
  await expect(
    friend.getByText(`@social-alice shared ${name}`, { exact: true }).first(),
  ).toBeVisible();
  const publicContext = await browser.newContext();
  const visitor = await publicContext.newPage();
  await visitor.goto(publicUrl);
  await expect(visitor.getByRole("heading", { name, exact: true })).toBeVisible();
  await expect(visitor.getByText("Private draft details", { exact: false })).toHaveCount(0);
  const downloadPromise = visitor.waitForEvent("download");
  await visitor.getByRole("link", { name: "Download", exact: true }).click();
  expect((await downloadPromise).suggestedFilename()).toBe("AGENTS.md");
  await bob.close();
  await publicContext.close();
});
