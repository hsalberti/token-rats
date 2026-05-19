/**
 * Test 7 — `/app/friends` lists rows from at least one shared (private) room
 * with another user; public rooms excluded (Track AD).
 */
import { expect, test } from "./fixtures";

test("friends view lists users from a shared private room", async ({ page, signedIn }) => {
  void signedIn;
  await page.goto("/app/friends");
  // The fixture surfaces burnerbot via a private shared room (Test Room).
  await expect(page.getByText(/burnerbot/i).first()).toBeVisible();
  // The shared private room name appears (a public room would not).
  await expect(page.getByText(/Test Room/i).first()).toBeVisible();
});
