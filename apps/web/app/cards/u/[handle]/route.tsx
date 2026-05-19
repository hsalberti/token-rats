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
    twitterHandle?: string | null;
    twitterVerified?: boolean;
    totals: {
      today: { tokens: number; costUsdCents: number };
      week: { tokens: number; costUsdCents: number };
      allTime: { tokens: number; costUsdCents: number };
    };
  } | null = null;

  // v1.2 Track Y — 60d heatmap rendered as a compact strip across the bottom
  // of the card. Best-effort: if the heatmap fetch fails (private profile,
  // network), we just omit it and keep the rest of the card.
  let heatmapCells: { tokens: number; level: number }[] = [];

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

  try {
    const hm = await api.getHeatmap(handle, 60);
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
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 40 }}>
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
        <div style={{ fontSize: 14, color: "#52525b" }}>Strava for AI token burn</div>
      </div>

      {/* Handle + subtitle */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          marginBottom: 10,
        }}
      >
        <div
          style={{
            fontSize: 76,
            fontWeight: 900,
            color: "#f4f4f5",
            letterSpacing: "-0.04em",
            lineHeight: 1,
          }}
        >
          {`@${handle}`}
        </div>
        {profile?.twitterVerified && profile.twitterHandle && (
          <TwitterPillSvg handle={profile.twitterHandle} />
        )}
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

      {/* v1.2 Track Y — 60d activity strip (rat-orange ramp) */}
      {heatmapCells.length > 0 && (
        <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 6 }}>
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
                    height: 18,
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

/**
 * v1.2 Track AC — Twitter/X verified-handle pill used in OG cards.
 * Inline SVG flag rendering via Satori; we keep the same X glyph as the
 * web `<TwitterHandlePill>` so screenshots match the live UI.
 */
function TwitterPillSvg({ handle }: { handle: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: "#27272a",
        border: "1.5px solid #3f3f46",
        borderRadius: 10,
        padding: "8px 14px",
        fontSize: 22,
        fontWeight: 700,
        color: "#e4e4e7",
      }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        width="20"
        height="20"
        style={{ color: "#e4e4e7" }}
      >
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
      <span>{`@${handle}`}</span>
    </div>
  );
}
