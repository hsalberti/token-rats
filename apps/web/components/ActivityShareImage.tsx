import {
  ACTIVITY_COLORS,
  type Heatmap,
  activityCalendar,
  activityColor,
  activityGrowthLabel,
  formatActivityTokens,
} from "@token-rats/contracts";

export function ActivityShareImage({ handle, heatmap }: { handle: string; heatmap: Heatmap }) {
  const { cells, columns } = activityCalendar(heatmap);
  const weeks = heatmap.range === "12w" ? 12 : 4;
  const { summary } = heatmap;
  const gridWidth = 630;
  const cell = 29;
  const gap = 8;
  const step = Math.min(43, (gridWidth - 46) / columns);

  return (
    <div
      style={{
        width: 1200,
        height: 630,
        display: "flex",
        flexDirection: "column",
        background: "#09090b",
        color: "#fafafa",
        fontFamily: "sans-serif",
        padding: "40px 48px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "1px solid #27272a",
          paddingBottom: 24,
        }}
      >
        <span style={{ fontSize: 26, fontWeight: 700 }}>
          Token <span style={{ color: "#f97316" }}>Rats</span>
        </span>
        <span style={{ color: "#a1a1aa", fontSize: 16, letterSpacing: 3 }}>
          AI ACTIVITY / {weeks} WEEKS
        </span>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingTop: 25,
        }}
      >
        <span style={{ fontSize: handle.length > 25 ? 28 : 38, fontWeight: 700 }}>@{handle}</span>
        <span style={{ fontSize: 17, color: "#71717a" }}>
          {heatmap.from} — {heatmap.to} / UTC
        </span>
      </div>
      <div style={{ display: "flex", flex: 1, alignItems: "center", gap: 32 }}>
        <div style={{ display: "flex", flexDirection: "column", width: 390 }}>
          <span style={{ fontSize: 84, fontWeight: 700, color: "#fb923c", letterSpacing: -4 }}>
            {formatActivityTokens(summary.tokens)}
          </span>
          <span style={{ fontSize: 17, color: "#a1a1aa", marginTop: 4 }}>
            tokens used in {weeks} weeks
          </span>
          <div style={{ display: "flex", marginTop: 28, gap: 26 }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 30, fontWeight: 700 }}>
                {summary.activeDays}
                <span style={{ color: "#71717a", fontSize: 18 }}> / {summary.totalDays}</span>
              </span>
              <span style={{ color: "#a1a1aa", fontSize: 14, marginTop: 7 }}>active days</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span
                style={{
                  fontSize: summary.changePercent === null ? 22 : 30,
                  fontWeight: 700,
                  color: "#fb923c",
                }}
              >
                {activityGrowthLabel(heatmap)}
              </span>
              <span style={{ color: "#a1a1aa", fontSize: 14, marginTop: 7 }}>
                {summary.comparison === "available"
                  ? `vs previous ${weeks} weeks`
                  : summary.comparison === "new"
                    ? "Building the habit"
                    : "No earlier usage to compare"}
              </span>
            </div>
          </div>
          {weeks === 12 && (
            <span style={{ fontSize: 15, color: "#a1a1aa", marginTop: 23 }}>
              {formatActivityTokens(summary.weeklyTokens)} tokens / week ·{" "}
              {summary.activeDaysPerWeek.toFixed(1)} active days / week
            </span>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", width: gridWidth }}>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                position: "relative",
                width: 46,
                height: 280,
              }}
            >
              {["Mon", "Wed", "Fri", "Sun"].map((day, i) => (
                <span
                  key={day}
                  style={{
                    position: "absolute",
                    top: 16 + i * 2 * (cell + gap),
                    color: "#71717a",
                    fontSize: 12,
                  }}
                >
                  {day}
                </span>
              ))}
            </div>
            <svg
              role="img"
              aria-label="AI activity calendar"
              width={columns * step}
              height={280}
              viewBox={`0 0 ${columns * step} 280`}
            >
              {cells.map((c) => (
                <rect
                  key={c.day}
                  x={c.col * step + 2}
                  y={8 + c.row * (cell + gap)}
                  width={cell}
                  height={cell}
                  rx={5}
                  fill={c.visible ? activityColor(c.tokens, heatmap.scaleMax) : "#18181b"}
                  stroke={c.day === heatmap.to ? "#fafafa" : c.visible ? "none" : "#27272a"}
                  strokeDasharray={c.visible ? undefined : "2 3"}
                  strokeWidth={c.visible ? 2 : 1}
                />
              ))}
            </svg>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 9,
              color: "#71717a",
              fontSize: 13,
            }}
          >
            <span>Less</span>
            {ACTIVITY_COLORS.map((color) => (
              <span
                key={color}
                style={{ width: 12, height: 12, borderRadius: 3, background: color }}
              />
            ))}
            <span>More</span>
            <span style={{ marginLeft: 22 }}>Today outlined · Faint squares outside window</span>
          </div>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          borderTop: "1px solid #27272a",
          paddingTop: 20,
          color: "#71717a",
          fontSize: 15,
        }}
      >
        <span>tokenrats.com/u/{handle}</span>
        <span>{weeks === 4 ? "My recent momentum with AI" : "A quarter of building with AI"}</span>
      </div>
    </div>
  );
}
