import { expect, test } from "@playwright/test";

// Use an isolated local Worker seeded with the account for this token.
const token = process.env.TOKEN_RATS_TEST_TOKEN;
test.describe("profile sharing and comparison", () => {
  test.skip(!token, "Set TOKEN_RATS_TEST_TOKEN for the isolated local test account.");
  test.beforeEach(async ({ context, baseURL }) => {
    await context.addCookies([{ name: "tr_session", value: token!, url: baseURL! }]);
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
