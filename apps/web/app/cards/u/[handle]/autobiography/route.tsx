/**
 * GET /cards/u/:handle/autobiography — Token Autobiography share card.
 * 1200x630 OG image. Visual summary of the onboarding stats.
 * Shared from /onboarding via "Share my autobiography" CTA.
 */
import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { ApiError, api } from "../../../../../lib/api";

export const runtime = "edge";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ handle: string }> },
): Promise<Response> {
  const { handle } = await context.params;

  type AutoData = {
    handle: string;
    totalTokens: number;
    totalCostUsdCents: number;
    monthTokens: number;
    monthCostUsdCents: number;
    biggestSessionTokens: number;
    dominantModel: string;
    mostActiveDayOfWeek: number;
    sessionsPerDay: number;
    totalSessions: number;
    monthlyCoffees: number;
    firstSyncDate: string | null;
  };

  let data: AutoData | null = null;

  try {
    const resp = await api.getAutobiography(handle);
    data = resp.autobiography;
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

  // Short model name for display
  function shortModel(model: string): string {
    if (model.includes("claude-3-5-sonnet")) return "Claude 3.5 Sonnet";
    if (model.includes("claude-3-5-haiku")) return "Claude 3.5 Haiku";
    if (model.includes("claude-3-opus")) return "Claude 3 Opus";
    if (model.includes("claude-sonnet-4")) return "Claude Sonnet 4";
    if (model.includes("claude-opus-4")) return "Claude Opus 4";
    if (model.includes("gpt-4o")) return "GPT-4o";
    if (model.includes("gpt-4")) return "GPT-4";
    if (model.includes("cursor")) return "Cursor";
    // Truncate to 24 chars max for display
    return model.length > 24 ? `${model.slice(0, 21)}...` : model;
  }

  const totalTokens = data?.totalTokens ?? 0;
  const totalCost = data?.totalCostUsdCents ?? 0;
  const monthCost = data?.monthCostUsdCents ?? 0;
  const biggestSession = data?.biggestSessionTokens ?? 0;
  const dominantModel = shortModel(data?.dominantModel ?? "unknown");
  const mostActiveDay = DAY_NAMES[data?.mostActiveDayOfWeek ?? 0] ?? "Monday";
  const sessionsPerDay = data?.sessionsPerDay ?? 0;
  const coffees = data?.monthlyCoffees ?? 0;
  const monthTokens = data?.monthTokens ?? 0;

  const image = new ImageResponse(
    <div
      style={{
        width: 1200,
        height: 630,
        background: "#09090b",
        display: "flex",
        flexDirection: "column",
        padding: "48px 60px",
        fontFamily: "system-ui, sans-serif",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Background glow */}
      <div
        style={{
          position: "absolute",
          bottom: -120,
          left: -60,
          width: 500,
          height: 500,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(249,115,22,0.12) 0%, transparent 60%)",
        }}
      />

      {/* Header row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 32,
        }}
      >
        <div
          style={{
            fontSize: 20,
            fontWeight: 900,
            color: "#f97316",
            letterSpacing: "-0.02em",
          }}
        >
          Token Rats
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "rgba(249,115,22,0.1)",
            border: "1px solid rgba(249,115,22,0.3)",
            borderRadius: 999,
            padding: "4px 14px",
          }}
        >
          <div style={{ fontSize: 14 }}>🐀</div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "#f97316",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            Token Autobiography
          </div>
        </div>
      </div>

      {/* Handle */}
      <div
        style={{
          fontSize: 60,
          fontWeight: 900,
          color: "#f4f4f5",
          letterSpacing: "-0.04em",
          lineHeight: 1,
          marginBottom: 32,
        }}
      >
        @{data?.handle ?? handle}
      </div>

      {/* Stats grid: 3 columns × 2 rows */}
      <div style={{ display: "flex", gap: 14, flex: 1 }}>
        {/* Column 1 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, flex: 1 }}>
          {/* All-time tokens */}
          <StatBlock
            label="All-time tokens"
            value={fmtTokens(totalTokens)}
            sub={fmtCost(totalCost)}
            accent
          />
          {/* Biggest session */}
          <StatBlock
            label="Best single session"
            value={fmtTokens(biggestSession)}
            sub="tokens in one go"
          />
        </div>

        {/* Column 2 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, flex: 1 }}>
          {/* This month */}
          <StatBlock label="This month" value={fmtTokens(monthTokens)} sub={fmtCost(monthCost)} />
          {/* Dominant model */}
          <StatBlock label="Favourite model" value={dominantModel} sub="by token volume" />
        </div>

        {/* Column 3 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, flex: 1 }}>
          {/* Coffee equivalence */}
          <StatBlock
            label="Coffees this month"
            value={coffees < 1 ? "<1" : `${Math.floor(coffees)}`}
            sub={`at $5/cup · ${fmtCost(monthCost)}`}
          />
          {/* Most active day */}
          <StatBlock
            label="Most active day"
            value={mostActiveDay}
            sub={`${sessionsPerDay.toFixed(1)} sessions/day avg`}
          />
        </div>
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
        <div style={{ fontSize: 15, color: "#52525b" }}>tokenrats.dev/u/{handle}</div>
        <div style={{ fontSize: 15, color: "#52525b" }}>
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

/** Mini stat block used in the autobiography card grid. */
function StatBlock({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        background: accent ? "#1c1917" : "#18181b",
        borderRadius: 14,
        padding: "16px 20px",
        border: accent ? "1.5px solid #f97316" : "1.5px solid #27272a",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        flex: 1,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: accent ? "#f97316" : "#71717a",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 900,
          color: accent ? "#f97316" : "#f4f4f5",
          lineHeight: 1.1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      {sub && <div style={{ fontSize: 13, color: "#71717a" }}>{sub}</div>}
    </div>
  );
}
