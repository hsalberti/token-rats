/**
 * GET /cards/trending/[range]
 *
 * OG image for the /trending page — shows top-10 public users for the given range.
 * Branded with "tokenrats.com/trending".
 */
import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { getTrending } from "../../../../lib/api";

export const runtime = "edge";

type Range = "today" | "7d" | "30d";

function validateRange(raw: string): Range {
  if (raw === "7d" || raw === "30d") return raw;
  return "today";
}

function fmtTokens(n: number) {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return `${n}`;
}

const RANGE_LABELS: Record<Range, string> = {
  today: "Today",
  "7d": "7 days",
  "30d": "30 days",
};

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ range: string }> },
): Promise<Response> {
  const { range: rawRange } = await context.params;
  const range = validateRange(rawRange);

  type Row = {
    rank: number;
    handle: string;
    tokens: number;
    costUsdCents: number;
  };

  let rows: Row[] = [];
  try {
    const data = await getTrending(range);
    rows = data.rows.slice(0, 10);
  } catch {
    return new Response("Card unavailable", { status: 500 });
  }

  const rangeLabel = RANGE_LABELS[range];

  const image = new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          background: "#09090b",
          display: "flex",
          flexDirection: "column",
          padding: "48px 56px",
          fontFamily: "system-ui, sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Glow */}
        <div
          style={{
            position: "absolute",
            top: -100,
            left: -100,
            width: 500,
            height: 500,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(249,115,22,0.12) 0%, transparent 70%)",
          }}
        />

        {/* Brand bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32 }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: "#f97316", letterSpacing: "-0.03em" }}>
            Token Rats
          </div>
          <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#3f3f46" }} />
          <div style={{ fontSize: 14, color: "#71717a" }}>Global Trending</div>
          <div
            style={{
              marginLeft: "auto",
              background: "#1c1917",
              border: "1.5px solid #f97316",
              borderRadius: 8,
              padding: "4px 12px",
              fontSize: 13,
              fontWeight: 700,
              color: "#f97316",
            }}
          >
            {rangeLabel}
          </div>
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: 52,
            fontWeight: 900,
            color: "#f4f4f5",
            letterSpacing: "-0.04em",
            lineHeight: 1,
            marginBottom: 32,
          }}
        >
          Top Token Rats
        </div>

        {/* Leaderboard list — two columns of 5 */}
        <div style={{ display: "flex", gap: 16, flex: 1 }}>
          {[rows.slice(0, 5), rows.slice(5, 10)].map((half, colIdx) => (
            <div key={colIdx} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
              {half.map((row) => (
                <div
                  key={row.rank}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    background: row.rank <= 3 ? "#1c1917" : "#18181b",
                    borderRadius: 10,
                    padding: "8px 12px",
                    border: row.rank <= 3 ? "1.5px solid rgba(249,115,22,0.3)" : "1.5px solid #27272a",
                  }}
                >
                  <span
                    style={{
                      width: 28,
                      fontSize: row.rank <= 3 ? 18 : 13,
                      fontWeight: 900,
                      color:
                        row.rank === 1
                          ? "#fbbf24"
                          : row.rank === 2
                            ? "#d4d4d8"
                            : row.rank === 3
                              ? "#b45309"
                              : "#71717a",
                      textAlign: "center",
                    }}
                  >
                    {row.rank <= 3 ? ["🥇", "🥈", "🥉"][row.rank - 1] : `#${row.rank}`}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      fontSize: 14,
                      fontWeight: 700,
                      color: "#e4e4e7",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    @{row.handle}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 900, color: "#f97316" }}>
                    {fmtTokens(row.tokens)}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          style={{
            marginTop: 24,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ fontSize: 15, color: "#52525b" }}>tokenrats.com/trending</div>
          <div style={{ fontSize: 15, color: "#52525b" }}>
            counts only — we can&apos;t read your prompts
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  );

  image.headers.set("Cache-Control", "public, max-age=300, s-maxage=600");
  return image;
}
