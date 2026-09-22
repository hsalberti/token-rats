import { expect, test } from "@playwright/test";

// Use an isolated local Worker seeded with the account for this token.
const token = process.env.TOKEN_RATS_TEST_TOKEN;
test.describe("open source community and comparison", () => {
  test.skip(!token, "Set TOKEN_RATS_TEST_TOKEN for the isolated local test account.");
  test.beforeEach(async ({ context, baseURL }) => {
    await context.addCookies([{ name: "tr_session", value: token!, url: baseURL! }]);
  });
  test("publish instructions, download, reply, and remove the post", async ({ page }) => {
    await page.goto("/community");
    await page.getByText("Share a post", { exact: true }).click();
    await page.getByLabel("Category", { exact: true }).selectOption("agents-md");
    await page.getByLabel("Title", { exact: true }).fill("A tested set of agent instructions");
    await page
      .getByLabel("Post or AGENTS.md content")
      .fill("# AGENTS.md\nRun tests before a release.\n<script>bad()</script>");
    await page.getByRole("button", { name: "Publish post", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "A tested set of agent instructions" }),
    ).toBeVisible();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download AGENTS.md" }).click();
    expect((await download).suggestedFilename()).toBe("AGENTS.md");
    await page.getByLabel("Your reply").fill("This is a browser test reply.");
    await page.getByRole("button", { name: "Post reply", exact: true }).click();
    await expect(page.getByText("This is a browser test reply.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Delete post", exact: true }).click();
    await expect(page).toHaveURL(/\/community$/);
  });
  test("save a subscription amount and reload the comparison", async ({ page }) => {
    await page.goto("/app/compare");
    const card = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Codex", exact: true }) });
    await card.getByLabel("Plan name").fill("My test subscription");
    await card.getByLabel("Amount paid (USD)").fill("25");
    await card.getByRole("button", { name: "Save subscription amount" }).click();
    await expect(card.getByText("Saved for this month.")).toBeVisible();
    await page.reload();
    await expect(card.getByLabel("Plan name")).toHaveValue("My test subscription");
    await expect(card.getByLabel("Amount paid (USD)")).toHaveValue("25");
    await expect(page.getByText("Cursor counts are estimates.", { exact: false })).toBeVisible();
  });
});
