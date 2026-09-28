import { expect, test } from "@playwright/test";

// Use an isolated local Worker seeded with the account for this token.
const token = process.env.TOKEN_RATS_TEST_TOKEN;
test.describe("profile sharing and comparison", () => {
  test.skip(!token, "Set TOKEN_RATS_TEST_TOKEN for the isolated local test account.");
  test.beforeEach(async ({ context, baseURL }) => {
    await context.addCookies([{ name: "tr_session", value: token!, url: baseURL! }]);
  });
  test("publish an instructions excerpt and workflow on the profile", async ({ page }) => {
    await page.goto("/settings/profile");
    await page
      .getByLabel("Favorite agent instructions")
      .fill("# AGENTS.md\nRun tests before a release.");
    await page.getByLabel("Publish all the text above", { exact: false }).check();
    await page
      .getByLabel("How my agents and apps work together")
      .fill("Codex plans and OpenCode implements, with a review before release.");
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(page.getByText("Saved", { exact: false }).first()).toBeVisible();
    await page.getByRole("link", { name: "View profile", exact: true }).click();
    await expect(page.getByText("Run tests before a release.", { exact: false })).toBeVisible();
    await expect(page.getByRole("heading", { name: "My agent workflow" })).toBeVisible();
    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Download AGENTS.md" }).click();
    expect((await download).suggestedFilename()).toBe("AGENTS.md");
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
