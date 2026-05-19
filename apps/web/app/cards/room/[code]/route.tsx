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
  type TopRow = {
    rank: number;
    handle: string;
    tokens: number;
    costUsdCents: number;
    twitterHandle?: string | null;
  };
  let top3: TopRow[] = [];

  // v1.2 Track Y — fetch the 60d room heatmap to render as a strip.
  // Best-effort; if the user isn't a member or fetch fails, we omit it.
  let heatmapCells: { tokens: number; level: number }[] = [];

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
      twitterHandle: r.twitterHandle ?? null,
    }));
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return new Response("Not found", { status: 404 });
    }
    // 401/403 (member-only room) and 5xx — return 500 so crawlers retry
    // instead of caching an empty podium that says "No data yet".
    return new Response("Card unavailable", { status: 500 });
  }

  // Member-gated; will 404 to non-members and we'll silently skip.
  try {
    const hm = await api.getRoomHeatmap(code, 60);
    heatmapCells = hm.cells.map((c) => ({ tokens: c.tokens, level: c.level }));
  } catch {
    heatmapCells = [];
  }

  function fmtTokens(n: number) {
    if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
    return `${n}`;
  }

  function fmtCost(cents: number) {
    return `$${(cents / 100).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  // Podium medal colors: gold, silver, bronze
  const medalColors = ["#f59e0b", "#a1a1aa", "#b45309"];
  const medalBg = ["rgba(245,158,11,0.15)", "rgba(161,161,170,0.1)", "rgba(180,83,9,0.1)"];
  const medalBorder = ["rgba(245,158,11,0.5)", "rgba(161,161,170,0.2)", "rgba(180,83,9,0.3)"];
  const medalLabels = ["👑 #1", "🥈 #2", "🥉 #3"];

  const image = new ImageResponse(
    <div
      style={{
        width: 1200,
        height: 630,
        background: "#09090b",
        display: "flex",
        flexDirection: "column",
        padding: "52px 60px",
        fontFamily: "system-ui, sans-serif",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Subtle orange glow top-right */}
      <div
        style={{
          position: "absolute",
          top: -100,
          right: -100,
          width: 450,
          height: 450,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(249,115,22,0.14) 0%, transparent 65%)",
        }}
      />

      {/* Brand bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
        <div
          style={{
            fontSize: 22,
            fontWeight: 900,
            color: "#f97316",
            letterSpacing: "-0.03em",
          }}
        >
          Token Rats
        </div>
        <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#3f3f46" }} />
        <div style={{ fontSize: 14, color: "#52525b" }}>7-day leaderboard</div>
      </div>

      {/* Room name */}
      <div
        style={{
          fontSize: 58,
          fontWeight: 900,
          color: "#f4f4f5",
          letterSpacing: "-0.04em",
          lineHeight: 1.05,
          marginBottom: 32,
        }}
      >
        {roomName}
      </div>

      {/* Leaderboard — podium layout */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
        {top3.length === 0 ? (
          <div
            style={{
              color: "#52525b",
              fontSize: 22,
              background: "#18181b",
              border: "1.5px solid #27272a",
              borderRadius: 16,
              padding: "24px 28px",
            }}
          >
            No data yet — sync to climb the board!
          </div>
        ) : (
          top3.map((row, i) => (
            <div
              key={row.handle}
              style={{
                display: "flex",
                alignItems: "stretch",
                background: i === 0 ? "#1a1408" : "#18181b",
                borderRadius: 16,
                border: `1.5px solid ${medalBorder[i] ?? "#27272a"}`,
                overflow: "hidden",
              }}
            >
              {/* Medal accent bar */}
              <div
                style={{
                  width: 5,
                  background: medalColors[i] ?? "#3f3f46",
                  flexShrink: 0,
                }}
              />

              {/* Content */}
              <div
                style={{
                  padding: i === 0 ? "22px 24px" : "16px 24px",
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  flex: 1,
                  background: i === 0 ? medalBg[i] : "transparent",
                }}
              >
                <div
                  style={{
                    fontSize: i === 0 ? 20 : 16,
                    fontWeight: 900,
                    color: medalColors[i] ?? "#a1a1aa",
                    minWidth: 52,
                  }}
                >
                  {medalLabels[i] ?? `#${row.rank}`}
                </div>

                {/* Handle + verified pill */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    flex: 1,
                  }}
                >
                  <div
                    style={{
                      fontSize: i === 0 ? 30 : 24,
                      fontWeight: 800,
                      color: i === 0 ? "#fbbf24" : "#f4f4f5",
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {`@${row.handle}`}
                  </div>
                  {row.twitterHandle && <TwitterPillSvg handle={row.twitterHandle} />}
                </div>

                {/* Token count + cost */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-end",
                    gap: 2,
                  }}
                >
                  <div
                    style={{
                      fontSize: i === 0 ? 32 : 26,
                      fontWeight: 900,
                      color: i === 0 ? "#f97316" : "#f4f4f5",
                      fontVariantNumeric: "tabular-nums",
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {fmtTokens(row.tokens)}
                  </div>
                  <div style={{ fontSize: 14, color: "#71717a" }}>{fmtCost(row.costUsdCents)}</div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* v1.2 Track Y — 60d room activity strip */}
      {heatmapCells.length > 0 && (
        <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 6 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "#71717a",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            Last 60 days
          </div>
          <div style={{ display: "flex", gap: 2 }}>
            {heatmapCells.map((c, i) => {
              const palette = ["#27272a", "#7c2d12", "#9a3412", "#c2410c", "#f97316"];
              const fill = palette[c.level] ?? palette[0];
              return (
                <div
                  key={i}
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 3,
                    background: fill,
                  }}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Footer */}
      <div
        style={{
          marginTop: 20,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ fontSize: 16, color: "#52525b" }}>{`tokenrats.com/r/${code}`}</div>
        <div style={{ fontSize: 16, color: "#52525b" }}>
          counts only — we can&apos;t read your prompts
        </div>
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
    },
  );

  // Allow CDN caching
  image.headers.set("Cache-Control", "public, max-age=300, s-maxage=600");
  return image;
}

/** v1.2 Track AC — Twitter/X pill (OG card variant). */
function TwitterPillSvg({ handle }: { handle: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        background: "#27272a",
        border: "1.5px solid #3f3f46",
        borderRadius: 8,
        padding: "4px 10px",
        fontSize: 16,
        fontWeight: 700,
        color: "#e4e4e7",
      }}
    >
      <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
      <span>{`@${handle}`}</span>
    </div>
  );
}
