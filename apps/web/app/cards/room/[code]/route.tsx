import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { api, ApiError } from "../../../../lib/api";

export const runtime = "edge";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ code: string }> },
): Promise<Response> {
  const { code } = await context.params;

  // Attempt to fetch live data; fall back to placeholder on error
  let roomName = code;
  type TopRow = { rank: number; handle: string; tokens: number; costUsdCents: number };
  let top3: TopRow[] = [];

  try {
    const [roomData, boardData] = await Promise.all([
      api.getRoom(code as Parameters<typeof api.getRoom>[0]),
      api.getLeaderboard(code as Parameters<typeof api.getLeaderboard>[0], "7d"),
    ]);
    roomName = roomData.room.name;
    top3 = boardData.leaderboard.rows.slice(0, 3).map((r) => ({
      rank: r.rank,
      handle: r.handle,
      tokens: r.tokens,
      costUsdCents: r.costUsdCents,
    }));
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return new Response("Not found", { status: 404 });
    }
    // On other errors fall through with defaults
  }

  function fmtTokens(n: number) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
    return `${n}`;
  }

  function fmtCost(cents: number) {
    return `$${(cents / 100).toFixed(2)}`;
  }

  const rankColors = ["#facc15", "#a1a1aa", "#b45309"];

  const image = new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          background: "#09090b",
          display: "flex",
          flexDirection: "column",
          padding: "60px",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Brand bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 40 }}>
          <div
            style={{
              fontSize: 28,
              fontWeight: 900,
              color: "#f97316",
              letterSpacing: "-0.03em",
            }}
          >
            Token Rats
          </div>
          <div
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: "#71717a",
              marginTop: 4,
            }}
          >
            — Strava for AI token burn
          </div>
        </div>

        {/* Room name */}
        <div
          style={{
            fontSize: 54,
            fontWeight: 900,
            color: "#f4f4f5",
            letterSpacing: "-0.04em",
            lineHeight: 1.1,
            marginBottom: 8,
          }}
        >
          {roomName}
        </div>
        <div style={{ fontSize: 20, color: "#71717a", marginBottom: 48 }}>
          7-day leaderboard
        </div>

        {/* Leaderboard rows */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16, flex: 1 }}>
          {top3.length === 0 ? (
            <div style={{ color: "#71717a", fontSize: 24 }}>No data yet — sync to climb the board!</div>
          ) : (
            top3.map((row, i) => (
              <div
                key={row.handle}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 20,
                  background: i === 0 ? "#1c1917" : "#18181b",
                  borderRadius: 16,
                  padding: "20px 28px",
                  border: i === 0 ? "1.5px solid #f97316" : "1.5px solid #27272a",
                }}
              >
                {/* Rank */}
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    background: rankColors[i] ?? "#3f3f46",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 18,
                    fontWeight: 900,
                    color: i === 0 ? "#713f12" : i === 1 ? "#18181b" : "#fef3c7",
                    flexShrink: 0,
                  }}
                >
                  {row.rank}
                </div>

                {/* Handle */}
                <div
                  style={{
                    fontSize: 26,
                    fontWeight: 700,
                    color: i === 0 ? "#f97316" : "#f4f4f5",
                    flex: 1,
                  }}
                >
                  @{row.handle}
                </div>

                {/* Tokens */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                  <div
                    style={{
                      fontSize: 28,
                      fontWeight: 900,
                      color: "#f97316",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {fmtTokens(row.tokens)}
                  </div>
                  <div style={{ fontSize: 16, color: "#71717a" }}>
                    {fmtCost(row.costUsdCents)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            marginTop: 32,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ fontSize: 18, color: "#52525b" }}>tokenrats.dev/r/{code}</div>
          <div style={{ fontSize: 18, color: "#52525b" }}>counts only — we can&apos;t read your prompts</div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  );

  // Allow CDN caching
  image.headers.set("Cache-Control", "public, max-age=300, s-maxage=600");
  return image;
}
