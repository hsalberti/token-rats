import { readFile } from "node:fs/promises";
import { type APIRequestContext, expect, test } from "@playwright/test";

const api = process.env.PLAYWRIGHT_API_BASE_URL ?? "http://127.0.0.1:8787";

async function publicHandle(request: APIRequestContext) {
  if (process.env.TOKEN_RATS_ACTIVITY_E2E_HANDLE) return process.env.TOKEN_RATS_ACTIVITY_E2E_HANDLE;
  const response = await request.get(`${api}/v1/trending?range=7d`).catch(() => null);
  if (!response?.ok()) return null;
  const data = (await response.json()) as { rows?: Array<{ handle: string }> };
  return data.rows?.[0]?.handle ?? null;
}

test("activity windows show every day including today without scrolling", async ({
  page,
  request,
}, info) => {
  const handle = await publicHandle(request);
  test.skip(!handle, "Requires a public profile or TOKEN_RATS_ACTIVITY_E2E_HANDLE.");
  await page.goto(`/u/${handle}`);
  const activity = page.locator("#activity");
  await expect(activity).toBeVisible();
  await activity.scrollIntoViewIfNeeded();
  await expect(activity.getByRole("button", { name: "4 weeks", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(activity.locator('rect[data-in-window="true"]')).toHaveCount(28);
  await expect(activity.locator('rect[aria-label^="Today,"]')).toHaveCount(1);
  const grid = await activity.locator("rect").evaluateAll((rects) => {
    const columns = new Map<string, number>();
    for (const rect of rects) {
      const x = rect.getAttribute("x")!;
      columns.set(x, (columns.get(x) ?? 0) + 1);
    }
    return Array.from(columns.values());
  });
  expect(grid.every((count) => count === 7)).toBe(true);
  const outside = activity.locator('rect[data-in-window="false"]');
  if (await outside.count()) {
    await expect(outside.first()).toHaveAttribute("fill", "#18181b");
    await expect(outside.first()).toHaveAttribute("aria-label", /outside selected window/);
  }
  const last = activity.locator('rect[aria-label^="Today,"]');
  expect(
    await last.evaluate((el) => {
      const cell = el.getBoundingClientRect();
      const card = el.closest("section")!.getBoundingClientRect();
      return (
        cell.width > 0 &&
        cell.left >= card.left &&
        cell.right <= card.right &&
        cell.right <= window.innerWidth
      );
    }),
  ).toBe(true);
  await activity.getByRole("button", { name: "12 weeks", exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("range")).toBe("12w");
  await expect(activity.locator('rect[data-in-window="true"]')).toHaveCount(84);
  expect(
    await last.evaluate((el) => {
      const cell = el.getBoundingClientRect();
      const card = el.closest("section")!.getBoundingClientRect();
      return (
        cell.width > 0 &&
        cell.left >= card.left &&
        cell.right <= card.right &&
        cell.right <= window.innerWidth
      );
    }),
  ).toBe(true);
  expect(await activity.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await activity.screenshot({
    path: info.outputPath("activity-12-weeks.png"),
    animations: "disabled",
  });
  await page.reload();
  await expect(activity.getByRole("button", { name: "12 weeks", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await activity.getByRole("button", { name: "4 weeks", exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("range")).toBe("4w");
  await expect(activity.getByRole("button", { name: "4 weeks", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await activity.screenshot({
    path: info.outputPath("activity-4-weeks.png"),
    animations: "disabled",
  });
});

test("share progress previews a real PNG and links to the selected activity window", async ({
  page,
  request,
}, info) => {
  test.setTimeout(90000);
  const handle = await publicHandle(request);
  test.skip(!handle, "Requires a public profile or TOKEN_RATS_ACTIVITY_E2E_HANDLE.");
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          document.documentElement.dataset.copied = text;
        },
      },
    });
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: ShareData) => {
        document.documentElement.dataset.shared = data.files?.[0]?.name;
        document.documentElement.dataset.gesture = String(navigator.userActivation.isActive);
      },
    });
  });
  await page.goto(`/u/${handle}?range=12w#activity`);
  await page.locator("#activity").getByRole("button", { name: "Share progress" }).click();
  const dialog = page.getByRole("dialog", { name: "Share your AI progress" });
  await expect(dialog.getByRole("img")).toBeVisible({ timeout: 45000 });
  await expect(dialog.getByText("12 weeks of activity, momentum, and consistency.")).toBeVisible();
  await dialog.getByRole("button", { name: "Share image" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-shared", `token-rats-${handle}.png`);
  await expect(page.locator("html")).toHaveAttribute("data-gesture", "true");
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Download PNG" }).click();
  const path = info.outputPath("activity-share.png");
  await (await download).saveAs(path);
  const png = await readFile(path);
  expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(png.readUInt32BE(16)).toBe(1200);
  expect(png.readUInt32BE(20)).toBe(630);
  await dialog.getByRole("button", { name: "Copy link" }).click();
  const copied = await page.locator("html").getAttribute("data-copied");
  expect(copied).toContain("range=12w&share=activity#activity");
  await page.goto(copied!);
  await expect(page.locator("#activity")).toBeInViewport();
  await expect(page.locator('#activity button[aria-pressed="true"]')).toHaveText("12 weeks");
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    /\/activity\?range=12w/,
  );
});
