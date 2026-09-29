import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
function token(user: string) {
  const payload = `${user}.${Date.now() + 3600000}`;
  return `${payload}.${createHmac("sha256", "social-local-test-only").update(payload).digest("base64url")}`;
}
test("update guide appears once per account and can be reopened from Notifications", async ({
  page,
  context,
  browser,
  baseURL,
}, info) => {
  test.skip(process.env.TOKEN_RATS_SOCIAL_E2E !== "1", "Requires isolated social test database");
  test.setTimeout(120000);
  const user = `release-${info.project.name}`;
  const cookie = { name: "tr_session", value: token(user), url: baseURL! };
  await context.addCookies([cookie]);
  await page.goto("/app");
  const guide = page.getByRole("dialog", { name: "Your agent setup has a story now" });
  await expect(guide).toBeVisible();
  await expect(
    guide.getByText("Automatic changes are friends only.", { exact: true }),
  ).toBeVisible();
  await expect(guide.getByLabel("Added", { exact: true })).toBeVisible();
  await page.screenshot({ path: `/tmp/token-rats-release-guide-${info.project.name}.png` });
  await guide.getByRole("button", { name: "Got it", exact: true }).click();
  await expect(guide).not.toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Small changes. Shared progress.", exact: true }),
  ).toBeVisible();
  await expect(guide).not.toBeVisible();
  const second = await browser.newContext({ baseURL });
  await second.addCookies([cookie]);
  const otherDevice = await second.newPage();
  await otherDevice.goto("/app/notifications");
  await expect(otherDevice.getByRole("heading", { name: "Inbox", exact: true })).toBeVisible();
  await expect(otherDevice.getByRole("dialog")).not.toBeVisible();
  await otherDevice.getByRole("button", { name: /What’s new/ }).click();
  await expect(otherDevice.getByRole("dialog")).toBeVisible();
  await otherDevice.keyboard.press("Escape");
  await expect(otherDevice.getByRole("dialog")).not.toBeVisible();
  const productEmails = otherDevice.getByRole("checkbox", { name: /Product update emails/ });
  await productEmails.uncheck();
  await expect(otherDevice.getByText("Preferences saved.", { exact: true })).toBeVisible();
  await otherDevice.reload();
  await expect(productEmails).not.toBeChecked();
  await second.close();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
