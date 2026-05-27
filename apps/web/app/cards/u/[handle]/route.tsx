import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { ApiError, api } from "../../../../lib/api";

export const runtime = "edge";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ handle: string }> },
): Promise<Response> {
  const { handle } = await context.params;
  const logoUrl = new URL("/brand/rat-mark.png", req.url).toString();

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
    // Any other failure (auth required, 5xx, network) — return 500 so
    // social-share crawlers retry instead of caching a blank card.
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

  const weekTokens = profile?.totals.week.tokens ?? 0;
  const allTimeTokens = profile?.totals.allTime.tokens ?? 0;
  const weekPct = allTimeTokens > 0 ? Math.round((weekTokens / allTimeTokens) * 100) : null;

  const image = new ImageResponse(
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
        overflow: "hidden",
      }}
    >
      {/* Orange radial glow */}
      <div
        style={{
          position: "absolute",
          top: -80,
          right: -80,
          width: 420,
          height: 420,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(249,115,22,0.16) 0%, transparent 70%)",
        }}
      />

      {/* Brand bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 40 }}>
        {" "}
        <img src={logoUrl} alt="" width={40} height={40} />
        <div
          style={{
            display: "flex",
            fontSize: 24,
            fontWeight: 900,
            color: "#f4f4f5",
            letterSpacing: "-0.03em",
          }}
        >
          <span>Token&nbsp;</span>
          <span style={{ color: "#f97316" }}>Rats</span>
        </div>
        <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#3f3f46" }} />
        <div style={{ fontSize: 14, color: "#52525b" }}>Strava for AI token burn</div>
      </div>

      {/* Handle + subtitle */}
      <div
        style={{
          fontSize: 76,
          fontWeight: 900,
          color: "#f4f4f5",
          letterSpacing: "-0.04em",
          lineHeight: 1,
          marginBottom: 10,
        }}
      >
        {`@${handle}`}
      </div>
      <div style={{ fontSize: 20, color: "#71717a", marginBottom: 44 }}>Token Rat 🐀</div>

      {/* Stats row */}
      <div style={{ display: "flex", gap: 20 }}>
        {/* Today */}
        <div
          style={{
            flex: 1,
            background: "#18181b",
            borderRadius: 18,
            padding: "22px 24px",
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
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            Today
          </div>
          <div style={{ fontSize: 40, fontWeight: 900, color: "#f4f4f5", lineHeight: 1 }}>
            {fmtTokens(profile?.totals.today.tokens ?? 0)}
          </div>
          <div style={{ fontSize: 17, color: "#71717a" }}>
            {fmtCost(profile?.totals.today.costUsdCents ?? 0)}
          </div>
        </div>

        {/* This week — rat-orange highlight */}
        <div
          style={{
            flex: 1,
            background: "#1c1917",
            borderRadius: 18,
            padding: "22px 24px",
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
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            This week
          </div>
          <div style={{ fontSize: 40, fontWeight: 900, color: "#f97316", lineHeight: 1 }}>
            {fmtTokens(weekTokens)}
          </div>
          <div style={{ fontSize: 17, color: "#a1a1aa" }}>
            {fmtCost(profile?.totals.week.costUsdCents ?? 0)}
          </div>
        </div>

        {/* All time */}
        <div
          style={{
            flex: 1,
            background: "#18181b",
            borderRadius: 18,
            padding: "22px 24px",
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
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            All time
          </div>
          <div style={{ fontSize: 40, fontWeight: 900, color: "#f4f4f5", lineHeight: 1 }}>
            {fmtTokens(allTimeTokens)}
          </div>
          <div style={{ fontSize: 17, color: "#71717a" }}>
            {fmtCost(profile?.totals.allTime.costUsdCents ?? 0)}
          </div>
        </div>
      </div>

      {/* Fun insight line */}
      {weekPct !== null && (
        <div style={{ marginTop: 28, fontSize: 19, color: "#52525b" }}>
          This week = {weekPct}% of all-time burn.{" "}
          <span style={{ color: "#f97316" }}>Keep burning.</span>
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
        <div style={{ fontSize: 16, color: "#52525b" }}>{`tokenrats.com/u/${handle}`}</div>
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

  image.headers.set("Cache-Control", "public, max-age=300, s-maxage=600");
  return image;
}
