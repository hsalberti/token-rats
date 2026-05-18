import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { api, ApiError } from "../../../../lib/api";

export const runtime = "edge";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ handle: string }> },
): Promise<Response> {
  const { handle } = await context.params;

  let profile: {
    handle: string;
    totals: {
      today: { tokens: number; costUsdCents: number };
      week: { tokens: number; costUsdCents: number };
      allTime: { tokens: number; costUsdCents: number };
    };
  } | null = null;

  try {
    const data = await api.getProfile(handle);
    profile = data.profile;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return new Response("Not found", { status: 404 });
    }
  }

  function fmtTokens(n: number) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
    return `${n}`;
  }

  function fmtCost(cents: number) {
    return `$${(cents / 100).toFixed(2)}`;
  }

  const weekTokens = profile?.totals.week.tokens ?? 0;
  const allTimeTokens = profile?.totals.allTime.tokens ?? 0;
  const teamPercent =
    allTimeTokens > 0 ? Math.round((weekTokens / allTimeTokens) * 100) : null;

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
        {/* Brand */}
        <div
          style={{
            fontSize: 22,
            fontWeight: 900,
            color: "#f97316",
            letterSpacing: "-0.03em",
            marginBottom: 48,
          }}
        >
          Token Rats
        </div>

        {/* Handle */}
        <div
          style={{
            fontSize: 72,
            fontWeight: 900,
            color: "#f4f4f5",
            letterSpacing: "-0.04em",
            lineHeight: 1,
            marginBottom: 12,
          }}
        >
          @{handle}
        </div>
        <div style={{ fontSize: 22, color: "#71717a", marginBottom: 56 }}>
          Token Rat
        </div>

        {/* Stats row */}
        <div style={{ display: "flex", gap: 24 }}>
          {/* Today */}
          <div
            style={{
              flex: 1,
              background: "#18181b",
              borderRadius: 16,
              padding: "24px 28px",
              border: "1.5px solid #27272a",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, color: "#71717a", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Today
            </div>
            <div style={{ fontSize: 36, fontWeight: 900, color: "#f4f4f5" }}>
              {fmtTokens(profile?.totals.today.tokens ?? 0)}
            </div>
            <div style={{ fontSize: 18, color: "#71717a" }}>
              {fmtCost(profile?.totals.today.costUsdCents ?? 0)}
            </div>
          </div>

          {/* This week — highlighted */}
          <div
            style={{
              flex: 1,
              background: "#1c1917",
              borderRadius: 16,
              padding: "24px 28px",
              border: "1.5px solid #f97316",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, color: "#f97316", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              This week
            </div>
            <div style={{ fontSize: 36, fontWeight: 900, color: "#f97316" }}>
              {fmtTokens(weekTokens)}
            </div>
            <div style={{ fontSize: 18, color: "#71717a" }}>
              {fmtCost(profile?.totals.week.costUsdCents ?? 0)}
            </div>
          </div>

          {/* All time */}
          <div
            style={{
              flex: 1,
              background: "#18181b",
              borderRadius: 16,
              padding: "24px 28px",
              border: "1.5px solid #27272a",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, color: "#71717a", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              All time
            </div>
            <div style={{ fontSize: 36, fontWeight: 900, color: "#f4f4f5" }}>
              {fmtTokens(allTimeTokens)}
            </div>
            <div style={{ fontSize: 18, color: "#71717a" }}>
              {fmtCost(profile?.totals.allTime.costUsdCents ?? 0)}
            </div>
          </div>
        </div>

        {/* Fun stat */}
        {teamPercent !== null && (
          <div
            style={{
              marginTop: 32,
              fontSize: 20,
              color: "#52525b",
            }}
          >
            This week = {teamPercent}% of all-time burn. Keep burning.
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            marginTop: "auto",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ fontSize: 18, color: "#52525b" }}>tokenrats.dev/u/{handle}</div>
          <div style={{ fontSize: 18, color: "#52525b" }}>counts only — we can&apos;t read your prompts</div>
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
