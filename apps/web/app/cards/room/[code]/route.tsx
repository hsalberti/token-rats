import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { ApiError, api } from "../../../../lib/api";

export const runtime = "edge";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ code: string }> },
): Promise<Response> {
  const { code } = await context.params;

  let roomName = code;
  let memberCount = 0;
  let total30dTokens = 0;
  let total30dCostUsdCents = 0;
  let groupStreakDays = 0;

  // Summary is public — drives the headline + stat strip. 404 here is real.
  try {
    const res = await api.getRoomSummary(code as Parameters<typeof api.getRoomSummary>[0]);
    roomName = res.summary.name;
    memberCount = res.summary.memberCount;
    total30dTokens = res.summary.total30dTokens;
    total30dCostUsdCents = res.summary.total30dCostUsdCents;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return new Response("Not found", { status: 404 });
    }
    return new Response("Card unavailable", { status: 500 });
  }

  // Group streak is best-effort — the card still renders without it on
  // private rooms where this endpoint requires membership (which an
  // unauthenticated crawler can't satisfy).
  try {
    const res = await api.getRoomGroupStreak(code as Parameters<typeof api.getRoomGroupStreak>[0]);
    groupStreakDays = res.groupStreak.currentStreak;
  } catch {
    // No streak in the card — silently omit the pill.
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
        <div style={{ fontSize: 14, color: "#52525b" }}>last 30 days</div>
      </div>

      {/* Room name */}
      <div
        style={{
          fontSize: 64,
          fontWeight: 900,
          color: "#f4f4f5",
          letterSpacing: "-0.04em",
          lineHeight: 1.05,
          marginBottom: 16,
        }}
      >
        {roomName}
      </div>

      {/* Group streak pill */}
      {groupStreakDays > 0 && (
        <div
          style={{
            display: "inline-flex",
            alignSelf: "flex-start",
            alignItems: "center",
            gap: 8,
            padding: "8px 16px",
            borderRadius: 999,
            border: "1.5px solid rgba(249,115,22,0.4)",
            background: "rgba(249,115,22,0.12)",
            color: "#fb923c",
            fontSize: 22,
            fontWeight: 800,
            marginBottom: 32,
          }}
        >
          <span>🔥</span>
          <span>{`${groupStreakDays}-day group streak`}</span>
        </div>
      )}

      {/* Stat strip — Members · 30d tokens · 30d cost */}
      <div style={{ display: "flex", gap: 16, flex: 1, alignItems: "stretch" }}>
        <StatTile label="Members" value={`${memberCount}`} />
        <StatTile label="30d tokens" value={fmtTokens(total30dTokens)} primary />
        <StatTile label="30d spent" value={fmtCost(total30dCostUsdCents)} />
      </div>

      {/* Footer */}
      <div
        style={{
          marginTop: 28,
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

function StatTile({
  label,
  value,
  primary = false,
}: {
  label: string;
  value: string;
  primary?: boolean;
}) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        background: primary ? "#1a1408" : "#18181b",
        borderRadius: 18,
        border: `1.5px solid ${primary ? "rgba(249,115,22,0.4)" : "#27272a"}`,
        padding: "28px 32px",
        gap: 10,
      }}
    >
      <div
        style={{
          fontSize: 16,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: primary ? "#fb923c" : "#71717a",
          fontWeight: 700,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 72,
          fontWeight: 900,
          color: primary ? "#f97316" : "#f4f4f5",
          letterSpacing: "-0.04em",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
    </div>
  );
}
