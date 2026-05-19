/**
 * Test 5 — `/o/new` → fill form (name, slug, optional student + university)
 * → submit → land on `/o/<slug>/pending` with founder name and queue position
 * (Track AA).
 */
import { expect, test } from "./fixtures";

test("create org lands on pending page with founder + queue position", async ({
  page,
  signedIn,
}) => {
  void signedIn;
  await page.goto("/o/new");
  await expect(page.getByRole("heading", { name: /Create an org/i })).toBeVisible();

  // Fill the form. The slug we pick must match the fixture's pending org.
  await page.getByLabel(/org name/i).fill("Test Org");
  await page.getByLabel(/^slug/i).fill("test-org");

  // Student checkbox + university.
  const student = page.getByLabel(/student/i).first();
  if (await student.isVisible().catch(() => false)) {
    await student.check().catch(() => {});
    const uni = page.getByLabel(/university/i).first();
    if (await uni.isVisible().catch(() => false)) {
      await uni.fill("Test University").catch(() => {});
    }
  }

  await page
    .getByRole("button", { name: /create|reserve|submit|get on/i })
    .first()
    .click();
  await expect(page).toHaveURL(/\/o\/test-org\/pending/, { timeout: 10_000 });
  // Queue position (#7 per fixture).
  await expect(page.getByText("#7")).toBeVisible();
  // Founder handle from /v1/orgs/:slug fixture.
  await expect(page.getByText("@ratking")).toBeVisible();
});
