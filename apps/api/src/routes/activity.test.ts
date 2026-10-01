import {
  GetHeatmapResponse,
  type Heatmap,
  activityCalendar,
  offsetDay,
} from "@token-rats/contracts";
import { Hono } from "hono";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Env } from "../env.js";
import { signToken } from "../lib/auth.js";
import { testDatabase } from "../lib/test-db.js";
import type { AuthVariables } from "../middleware/auth.js";
import profiles from "./profiles.js";
import roomAggregates from "./room-aggregates.js";

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
app.route("/u", profiles);
app.route("/r", roomAggregates);
let fixture: ReturnType<typeof testDatabase>;
const today = "2026-10-01";
beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(Date.UTC(2026, 9, 1, 12));
  fixture = testDatabase();
  fixture.db.prepare("UPDATE users SET public_profile=1 WHERE id='alice'").run();
});
afterEach(() => {
  fixture.db.close();
  vi.restoreAllMocks();
});
function day(offset: number, tokens: number, user = "alice") {
  fixture.db
    .prepare("INSERT INTO daily_rollup (user_id,day,tokens,sessions) VALUES (?,?,?,1)")
    .run(user, offsetDay(today, offset), tokens);
}
async function read(path = "/u/alice/heatmap") {
  const response = await app.request(`https://test${path}`, {}, fixture.env);
  expect(response.status).toBe(200);
  return GetHeatmapResponse.parse(await response.json()).heatmap;
}

it("counts exact rolling periods, compares equal windows, and excludes future and other-user usage", async () => {
  day(-200, 1); // establishes enough history
  day(-56, 9999); // outside the previous 4-week window
  day(-55, 40);
  day(-28, 60);
  day(-27, 50);
  day(0, 150);
  day(1, 9999);
  day(0, 9999, "bob");
  const result = await read();
  expect(result).toMatchObject({
    range: "4w",
    from: "2026-09-04",
    to: today,
    summary: {
      tokens: 200,
      activeDays: 2,
      totalDays: 28,
      comparison: "available",
      changePercent: 100,
      activeDaysPerWeek: 0.5,
    },
  });
  expect(result.days).toHaveLength(2);
  expect(result.summary.weeklyTokens).toBe(50);
});

it("shares the quarter color scale across views and calculates quarter consistency", async () => {
  day(-200, 1);
  day(-167, 100);
  day(-84, 100);
  day(-83, 600);
  day(-27, 200);
  day(0, 400);
  const recent = await read();
  const quarter = await read("/u/alice/heatmap?range=12w");
  expect(recent.scaleMax).toBe(600);
  expect(quarter.scaleMax).toBe(recent.scaleMax);
  expect(quarter.summary).toMatchObject({
    tokens: 1200,
    activeDays: 3,
    totalDays: 84,
    weeklyTokens: 100,
    activeDaysPerWeek: 0.25,
    changePercent: 500,
  });
});

it("does not invent growth for new users, empty profiles, or a zero baseline", async () => {
  expect((await read()).summary).toMatchObject({
    tokens: 0,
    comparison: "new",
    changePercent: null,
  });
  day(0, 100);
  expect((await read()).summary).toMatchObject({ comparison: "new", changePercent: null });
  day(-100, 100);
  expect((await read()).summary).toMatchObject({ comparison: "no-baseline", changePercent: null });
});

it("aligns all seven ending weekdays, includes today at the right edge, and renders exactly 28/84 days", async () => {
  const result = await read();
  for (const range of ["4w", "12w"] as const) {
    const count = range === "4w" ? 28 : 84;
    for (let offset = 0; offset < 7; offset++) {
      const to = offsetDay(today, offset);
      const data: Heatmap = {
        ...result,
        range,
        from: offsetDay(to, 1 - count),
        to,
        summary: { ...result.summary, totalDays: count },
      };
      const { columns, cells } = activityCalendar(data);
      const visible = cells.filter((c) => c.visible);
      expect(visible).toHaveLength(count);
      expect(visible.at(-1)).toMatchObject({ day: to, col: columns - 1 });
      for (const cell of visible)
        expect(cell.row).toBe((new Date(`${cell.day}T00:00:00Z`).getUTCDay() + 6) % 7);
    }
  }
});

it("enforces profile visibility and rejects unsupported ranges", async () => {
  expect(
    (await app.request("https://test/u/alice/heatmap?range=52w", {}, fixture.env)).status,
  ).toBe(400);
  fixture.db.prepare("UPDATE users SET public_profile=0 WHERE id='alice'").run();
  expect((await app.request("https://test/u/alice/heatmap", {}, fixture.env)).status).toBe(404);
  const token = await signToken("alice", fixture.env.SESSION_SIGNING_KEY, 3600000);
  expect(
    (
      await app.request(
        "https://test/u/alice/heatmap",
        { headers: { Authorization: `Bearer ${token}` } },
        fixture.env,
      )
    ).status,
  ).toBe(200);
});

it("aggregates only room members and keeps private room activity gated", async () => {
  fixture.db
    .prepare(
      "INSERT INTO rooms (id,code,name,owner_id,created_at,is_public) VALUES ('room','abc123','Test','alice',0,1)",
    )
    .run();
  fixture.db
    .prepare("INSERT INTO room_members (room_id,user_id,joined_at) VALUES ('room','alice',0)")
    .run();
  day(-200, 1);
  day(-28, 50);
  day(0, 100);
  day(0, 9999, "bob");
  expect((await read("/r/abc123/heatmap")).summary.tokens).toBe(100);
  fixture.db.prepare("UPDATE rooms SET is_public=0 WHERE id='room'").run();
  expect((await app.request("https://test/r/abc123/heatmap", {}, fixture.env)).status).toBe(404);
});
