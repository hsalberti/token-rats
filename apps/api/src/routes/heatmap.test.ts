/**
 * Unit tests for the heatmap route.
 *
 * Exercises the pure pieces (response shape, day-rows readback, build) via an
 * in-memory D1 mock — full Worker integration is out of scope for vitest.
 */
import { describe, expect, it, vi } from "vitest";
import { HeatmapResponse } from "@token-rats/contracts";
import { buildHeatmapResponse, readDayRows } from "./heatmap.js";
import type { Env } from "../env.js";

interface DayRowDB {
  day: string;
  tokens: number;
  cost_usd_cents: number;
}

/** Build a minimal D1 mock that returns `rows` from every `all<>()` call. */
function makeD1Mock(rows: DayRowDB[]): Pick<D1Database, "prepare"> {
  const stmt = {
    bind: vi.fn().mockReturnThis(),
    all: vi.fn().mockResolvedValue({ results: rows }),
    first: vi.fn().mockResolvedValue(null),
    run: vi.fn().mockResolvedValue({ meta: { changes: 0 } }),
  };
  return { prepare: vi.fn().mockReturnValue(stmt) } as unknown as Pick<D1Database, "prepare">;
}

function envWith(db: Pick<D1Database, "prepare">): Env {
  return { DB: db } as unknown as Env;
}

describe("readDayRows", () => {
  it("returns mapped day-rows for scope=user", async () => {
    const db = makeD1Mock([
      { day: "2024-06-01", tokens: 100, cost_usd_cents: 5 },
      { day: "2024-06-02", tokens: 200, cost_usd_cents: 10 },
    ]);
    const rows = await readDayRows(envWith(db), "user", "user-1", "2024-05-01");
    expect(rows).toEqual([
      { day: "2024-06-01", tokens: 100, costUsdCents: 5 },
      { day: "2024-06-02", tokens: 200, costUsdCents: 10 },
    ]);
  });

  it("returns mapped day-rows for scope=room", async () => {
    const db = makeD1Mock([{ day: "2024-06-01", tokens: 1500, cost_usd_cents: 90 }]);
    const rows = await readDayRows(envWith(db), "room", "room-1", "2024-05-01");
    expect(rows).toEqual([{ day: "2024-06-01", tokens: 1500, costUsdCents: 90 }]);
  });
});

describe("buildHeatmapResponse", () => {
  it("returns a HeatmapResponse-shaped object for an empty user", async () => {
    const db = makeD1Mock([]);
    const response = await buildHeatmapResponse(envWith(db), "user", "user-1", "alice", 60);
    expect(HeatmapResponse.safeParse(response).success).toBe(true);
    expect(response.scope).toBe("user");
    expect(response.id).toBe("alice");
    expect(response.rangeDays).toBe(60);
    expect(response.cells.length).toBe(60);
    expect(response.cells.every((c) => c.level === 0)).toBe(true);
  });

  it("uses 364 cells for the 52w toggle", async () => {
    const db = makeD1Mock([]);
    const response = await buildHeatmapResponse(envWith(db), "user", "user-1", "alice", 364);
    expect(response.cells.length).toBe(364);
    expect(response.rangeDays).toBe(364);
  });

  it("echoes the room code when scope=room", async () => {
    const db = makeD1Mock([]);
    const response = await buildHeatmapResponse(envWith(db), "room", "room-1", "abcdef", 60);
    expect(response.scope).toBe("room");
    expect(response.id).toBe("abcdef");
  });
});
