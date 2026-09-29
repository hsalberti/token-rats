import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

// Run against the isolated social test database, never a live account.
test("edit profile instructions, select lines, and share a real PNG", async ({
  page,
  context,
  request,
  browser,
  baseURL,
}, info) => {
  test.skip(process.env.TOKEN_RATS_SOCIAL_E2E !== "1", "Requires the isolated social database.");
  test.setTimeout(120_000);
  const payload = `social-alice.${Date.now() + 3_600_000}`;
  const token = `${payload}.${createHmac("sha256", "social-local-test-only").update(payload).digest("base64url")}`;
  const api = process.env.PLAYWRIGHT_API_BASE_URL ?? "http://127.0.0.1:8787";
  const headers = { Authorization: `Bearer ${token}` };
  const original =
    "# My agent brief\nLead with the outcome.\nKeep changes small.\nExplain the tradeoffs.\nVerify before shipping.";
  const created = await request.post(`${api}/v1/setups`, {
    headers,
    data: {
      name: `Profile brief ${info.project.name}`,
      visibility: "public",
      bundle: {
        files: [{ name: "AGENTS.md", content: original }],
        tools: "My tools stay unchanged",
      },
    },
  });
  expect(created.status()).toBe(201);
  const setup = (await created.json()) as { id: string; versionId: string };
  expect((await request.post(`${api}/v1/setups/${setup.id}/feature`, { headers })).ok()).toBe(true);
  await context.addCookies([{ name: "tr_session", value: token, url: baseURL! }]);
  // Exercise copy in every engine without depending on OS clipboard permissions.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          document.documentElement.dataset.copied = text;
        },
      },
    });
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: () => true,
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: ShareData) => {
        document.documentElement.dataset.shared = data.files?.[0]?.name;
        document.documentElement.dataset.shareGesture = String(navigator.userActivation.isActive);
      },
    });
  });
  await page.goto("/u/social-alice");
  await page.getByRole("button", { name: "Edit AGENTS.md", exact: true }).click();
  await page
    .getByLabel("Paste a whole file or just the lines you want on your profile.")
    .fill(original.replace("Keep changes small.", "Keep the diff small and focused."));
  await page.getByRole("button", { name: "Save to profile", exact: true }).click();
  await expect(page.getByText("Keep the diff small and focused.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Select line 2", exact: true }).click();
  await page.getByLabel("Through line").fill("3");
  await page.getByRole("button", { name: "Copy lines 2–3" }).click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-copied",
    "Lead with the outcome.\nKeep the diff small and focused.",
  );
  await page.route("**/cards/u/social-alice?*", (route) => route.abort(), { times: 1 });
  await page.getByRole("button", { name: "Share selected lines" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Could not generate your card. Please try again.")).toBeVisible();
  await dialog.getByRole("button", { name: "Try again" }).click();
  await expect(dialog.getByRole("button", { name: "Download PNG" })).toBeEnabled({
    timeout: 45_000,
  });
  await expect(dialog.getByRole("img")).toBeVisible();
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await dialog.getByRole("button", { name: "Share image" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-shared", "token-rats-social-alice.png");
  await expect(page.locator("html")).toHaveAttribute("data-share-gesture", "true");
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Download PNG" }).click();
  const png = await download;
  expect(png.suggestedFilename()).toBe("token-rats-social-alice.png");
  const imagePath = info.outputPath("profile-share.png");
  await png.saveAs(imagePath);
  const image = await readFile(imagePath);
  expect(image.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(image.readUInt32BE(16)).toBe(1200);
  expect(image.readUInt32BE(20)).toBe(630);
  await page.evaluate(() => Object.defineProperty(navigator, "canShare", { value: () => false }));
  const fallbackDownload = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Share image" }).click();
  expect((await fallbackDownload).suggestedFilename()).toBe("token-rats-social-alice.png");
  await expect(dialog.getByText("Image downloaded. Attach it to your post.")).toBeVisible();
  await dialog.getByRole("button", { name: "Copy link" }).click();
  const shareUrl = await page.locator("html").getAttribute("data-copied");
  expect(shareUrl).toContain("start=2&end=3");
  await page.screenshot({ path: info.outputPath("share-dialog.png"), fullPage: true });
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  // An old version must remain intact after a profile edit.
  const old = await request.get(`${api}/v1/setups/versions/${setup.versionId}`);
  expect((await old.json()).version.bundle.files[0].content).toBe(original);
  const current = await request.get(`${api}/v1/setups/${setup.id}`, { headers });
  expect((await current.json()).version.bundle.tools).toBe("My tools stay unchanged");
  const visitorContext = await browser.newContext({ baseURL, viewport: info.project.use.viewport });
  const visitor = await visitorContext.newPage();
  await visitor.goto(shareUrl!);
  await expect(visitor.locator("pre")).toHaveText(
    "Lead with the outcome.\nKeep the diff small and focused.",
  );
  await expect(visitor.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    /start=2&end=3/,
  );
  await visitor.goto("/u/social-alice");
  await expect(visitor.getByRole("button", { name: "Edit AGENTS.md" })).toHaveCount(0);
  expect(
    await visitor.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
  await visitorContext.close();
});
