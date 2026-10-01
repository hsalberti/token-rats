import {
  ACTIVITY_COLORS,
  type Heatmap as HeatmapData,
  activityCalendar,
  activityColor,
  activityGrowthLabel,
  formatActivityTokens,
  offsetDay,
} from "@token-rats/contracts";

export function Heatmap({ heatmap }: { heatmap: HeatmapData }) {
  const { columns, cells, start } = activityCalendar(heatmap);
  const weeks = heatmap.range === "12w" ? 12 : 4;
  const { summary } = heatmap;
  const longView = weeks === 12;
  const cell = 22;
  const gap = 5;
  const labelWidth = 32;
  const width = labelWidth + columns * (cell + gap);
  const height = 22 + 7 * (cell + gap);
  const dateLabel = (day: string) =>
    new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });

  return (
    <div className={longView ? "space-y-6" : "grid items-center gap-6 sm:grid-cols-[1fr_1.2fr]"}>
      <dl
        className={
          longView ? "grid grid-cols-3 gap-3" : "grid grid-cols-3 gap-3 sm:grid-cols-1 sm:gap-5"
        }
      >
        <div>
          <dt className="text-xs text-zinc-500">Tokens used</dt>
          <dd className="mt-1 text-2xl font-bold tracking-tight text-rat-400 sm:text-3xl">
            {formatActivityTokens(summary.tokens)}
          </dd>
          <p className="mt-1 text-xs text-zinc-500">
            {longView ? `${formatActivityTokens(summary.weeklyTokens)} / week` : "Last 4 weeks"}
          </p>
        </div>
        <div>
          <dt className="text-xs text-zinc-500">
            {longView ? "Active days / week" : "Active days"}
          </dt>
          <dd className="mt-1 text-xl font-semibold sm:text-2xl">
            {longView ? summary.activeDaysPerWeek.toFixed(1) : summary.activeDays}
            <span className="text-sm font-normal text-zinc-500">
              {" "}
              / {longView ? 7 : summary.totalDays}
            </span>
          </dd>
          <p className="mt-1 text-xs text-zinc-500">
            {longView ? `${summary.activeDays} of 84 days` : "Building the habit"}
          </p>
        </div>
        <div>
          <dt className="text-xs text-zinc-500">Usage change</dt>
          <dd
            className={`mt-1 text-lg font-semibold sm:text-xl ${summary.changePercent !== null && summary.changePercent >= 0 ? "text-rat-400" : "text-zinc-200"}`}
          >
            {activityGrowthLabel(heatmap)}
          </dd>
          <p className="mt-1 text-xs text-zinc-500">
            {summary.comparison === "available"
              ? `vs previous ${weeks} weeks`
              : summary.comparison === "new"
                ? "More history needed to compare"
                : `Previous ${weeks} weeks had no usage`}
          </p>
        </div>
      </dl>
      <div className="min-w-0">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`AI activity for the last ${weeks} weeks, ${heatmap.from} to ${heatmap.to}. Today is outlined.`}
          className={`block h-auto w-full ${longView ? "" : "mx-auto max-w-[190px] sm:max-w-[210px]"}`}
        >
          {Array.from({ length: columns }, (_, col) => {
            const day = offsetDay(start, col * 7);
            const labelDay = day < heatmap.from ? heatmap.from : day;
            if (longView && col % 3 !== 0 && col !== columns - 1) return null;
            return (
              <text
                key={day}
                x={labelWidth + col * (cell + gap)}
                y={11}
                fill="#71717a"
                fontSize={8}
                fontFamily="system-ui, sans-serif"
              >
                {dateLabel(labelDay)}
              </text>
            );
          })}
          {["Mon", "Wed", "Fri", "Sun"].map((label, i) => (
            <text
              key={label}
              x={0}
              y={22 + i * 2 * (cell + gap) + 15}
              fill="#71717a"
              fontSize={9}
              fontFamily="system-ui, sans-serif"
            >
              {label}
            </text>
          ))}
          {cells
            .filter((c) => c.visible)
            .map((c) => (
              <rect
                key={c.day}
                x={labelWidth + c.col * (cell + gap)}
                y={22 + c.row * (cell + gap)}
                width={cell}
                height={cell}
                rx={4}
                fill={activityColor(c.tokens, heatmap.scaleMax)}
                stroke={c.day === heatmap.to ? "#fafafa" : "none"}
                strokeWidth={1.5}
                aria-label={`${c.day === heatmap.to ? "Today, " : ""}${c.day}: ${formatActivityTokens(c.tokens)} tokens`}
              />
            ))}
        </svg>
        <div className="mt-3 flex items-center justify-between gap-2 text-[10px] text-zinc-500">
          <span>
            {dateLabel(heatmap.from)} – {dateLabel(heatmap.to)}
          </span>
          <div className="flex items-center gap-1.5">
            <span>Less</span>
            {ACTIVITY_COLORS.map((color) => (
              <span key={color} className="h-2 w-2 rounded-sm" style={{ background: color }} />
            ))}
            <span>More</span>
          </div>
        </div>
      </div>
    </div>
  );
}
