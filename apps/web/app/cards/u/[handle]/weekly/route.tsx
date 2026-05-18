/**
 * GET /cards/u/:handle/weekly — "Token Rat of the Week" share card.
 * 1200x630 OG image. Shows handle, week tokens + cost, rank in primary room.
 */
import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { api, ApiError } from "../../../../../lib/api";

export const runtime = "edge";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ handle: string }> },
): Promise<Response> {
  const { handle } = await context.params;

  type ProfileData = {
    handle: string;
    avatarUrl: string | null;
    weekTokens: number;
    weekCost: number;
    allTimeTokens: number;
  };

  let data: ProfileData | null = null;

  try {
    const resp = await api.getProfile(handle);
    data = {
      handle: resp.profile.handle,
      avatarUrl: resp.profile.avatarUrl,
      weekTokens: resp.profile.totals.week.tokens,
      weekCost: resp.profile.totals.week.costUsdCents,
      allTimeTokens: resp.profile.totals.allTime.tokens,
    };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return new Response("Not found", { status: 404 });
    }
    return new Response("Card unavailable", { status: 500 });
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

  // Compute "week % of all time" for a fun sub-stat
  const weekTokens = data?.weekTokens ?? 0;
  const allTimeTokens = data?.allTimeTokens ?? 0;
  const weekPct =
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
          padding: "56px 64px",
          fontFamily: "system-ui, sans-serif",
          position: "relative",
        }}
      >
        {/* Warm gradient accent top-right */}
        <div
          style={{
            position: "absolute",
            top: -80,
            right: -80,
            width: 400,
            height: 400,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(249,115,22,0.18) 0%, transparent 70%)",
          }}
        />

        {/* Brand bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 36 }}>
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
          <div style={{ fontSize: 14, color: "#52525b", marginTop: 2 }}>
            · Strava for AI token burn
          </div>
        </div>

        {/* Badge */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: "rgba(249,115,22,0.12)",
            border: "1px solid rgba(249,115,22,0.4)",
            borderRadius: 999,
            padding: "6px 18px",
            marginBottom: 28,
            width: "fit-content",
          }}
        >
          <div style={{ fontSize: 18 }}>🐀</div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "#f97316",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            Token Rat of the Week
          </div>
        </div>

        {/* Handle */}
        <div
          style={{
            fontSize: 80,
            fontWeight: 900,
            color: "#f4f4f5",
            letterSpacing: "-0.04em",
            lineHeight: 1,
            marginBottom: 40,
          }}
        >
          {`@${data?.handle ?? handle}`}
        </div>

        {/* Stats row */}
        <div style={{ display: "flex", gap: 20, flex: 1, alignItems: "flex-start" }}>
          {/* Week tokens — hero number */}
          <div
            style={{
              flex: 2,
              background: "#1c1917",
              borderRadius: 20,
              padding: "28px 32px",
              border: "2px solid #f97316",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "#f97316",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              This week
            </div>
            <div
              style={{
                fontSize: 64,
                fontWeight: 900,
                color: "#f97316",
                lineHeight: 1,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {fmtTokens(weekTokens)}
            </div>
            <div style={{ fontSize: 22, color: "#a1a1aa" }}>
              {fmtCost(data?.weekCost ?? 0)}
            </div>
          </div>

          {/* All time */}
          <div
            style={{
              flex: 1,
              background: "#18181b",
              borderRadius: 20,
              padding: "28px 32px",
              border: "1.5px solid #27272a",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "#71717a",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              All time
            </div>
            <div
              style={{
                fontSize: 42,
                fontWeight: 900,
                color: "#f4f4f5",
                lineHeight: 1,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {fmtTokens(allTimeTokens)}
            </div>
            {weekPct !== null && (
              <div style={{ fontSize: 16, color: "#52525b" }}>
                {weekPct}% burned this week
              </div>
            )}
          </div>
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
          <div style={{ fontSize: 16, color: "#52525b" }}>
            {`tokenrats.dev/u/${handle}`}
          </div>
          <div style={{ fontSize: 16, color: "#52525b" }}>
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
