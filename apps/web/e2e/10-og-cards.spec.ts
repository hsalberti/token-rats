/**
 * Test 10 — OG cards return 200 PNGs with `image/png` content-type and a
 * non-empty body across every card variant.
 */
import { expect, test } from "./fixtures";

const CARD_PATHS = [
  "/cards/room/TEST01",
  "/cards/u/ratking",
  "/cards/u/ratking/weekly",
  "/cards/u/ratking/autobiography",
  "/cards/trending/7d",
];

for (const path of CARD_PATHS) {
  test(`OG card: ${path} returns a 200 PNG`, async ({ request }) => {
    const res = await request.get(path);
    expect(res.status(), `status for ${path}`).toBe(200);
    const ct = res.headers()["content-type"] ?? "";
    expect(ct, `content-type for ${path}`).toContain("image/png");
    const body = await res.body();
    expect(body.byteLength, `body length for ${path}`).toBeGreaterThan(0);
  });
}
