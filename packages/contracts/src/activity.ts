import type { Heatmap, HeatmapDay, HeatmapRange } from "./api.js";

export const ACTIVITY_COLORS = ["#27272a", "#7c2d12", "#9a3412", "#c2410c", "#f97316"];

export function offsetDay(day: string, offset: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function activityBounds(range: HeatmapRange, to: string) {
  const totalDays = range === "12w" ? 84 : 28;
  const from = offsetDay(to, 1 - totalDays);
  const previousFrom = offsetDay(from, -totalDays);
  const scaleFrom = offsetDay(to, -83);
  return {
    totalDays,
    from,
    previousFrom,
    scaleFrom,
    queryFrom: previousFrom < scaleFrom ? previousFrom : scaleFrom,
  };
}

/** Both ranges use the same trailing-quarter color scale and equal comparison windows. */
export function buildActivityHeatmap(
  range: HeatmapRange,
  rows: HeatmapDay[],
  firstDay: string | null,
  to: string,
): Heatmap {
  const { totalDays, from, previousFrom, scaleFrom } = activityBounds(range, to);
  const days = rows.filter((d) => d.day >= from && d.day <= to);
  const tokens = days.reduce((sum, d) => sum + d.tokens, 0);
  const activeDays = days.filter((d) => d.tokens > 0).length;
  const previousTokens = rows
    .filter((d) => d.day >= previousFrom && d.day < from)
    .reduce((sum, d) => sum + d.tokens, 0);
  const comparison =
    !firstDay || firstDay > previousFrom ? "new" : previousTokens > 0 ? "available" : "no-baseline";
  return {
    range,
    from,
    to,
    days,
    scaleMax: rows
      .filter((d) => d.day >= scaleFrom && d.day <= to)
      .reduce((max, d) => Math.max(max, d.tokens), 0),
    summary: {
      tokens,
      activeDays,
      totalDays,
      weeklyTokens: tokens / (totalDays / 7),
      activeDaysPerWeek: activeDays / (totalDays / 7),
      changePercent:
        comparison === "available" ? ((tokens - previousTokens) / previousTokens) * 100 : null,
      comparison,
    },
  };
}

export function activityColor(tokens: number, max: number): string {
  const ratio = max > 0 ? tokens / max : 0;
  return ACTIVITY_COLORS[
    tokens === 0 ? 0 : ratio > 0.66 ? 4 : ratio > 0.33 ? 3 : ratio > 0.1 ? 2 : 1
  ]!;
}

export function formatActivityTokens(tokens: number): string {
  if (tokens >= 1e9) return `${Number((tokens / 1e9).toFixed(2))}B`;
  if (tokens >= 1e6) return `${Number((tokens / 1e6).toFixed(1))}M`;
  if (tokens >= 1e3) return `${Number((tokens / 1e3).toFixed(1))}K`;
  return Math.round(tokens).toLocaleString("en-US");
}

export function activityGrowthLabel(heatmap: Heatmap): string {
  if (heatmap.summary.comparison === "new")
    return `First ${heatmap.range === "12w" ? 12 : 4} weeks`;
  if (heatmap.summary.changePercent === null) return "No previous activity";
  const percent = Math.round(Math.abs(heatmap.summary.changePercent));
  return `${heatmap.summary.changePercent >= 0 ? "↑" : "↓"} ${percent}%`;
}

/** Calendar-aligned columns; partial edge weeks preserve exactly 28 or 84 days. */
export function activityCalendar(heatmap: Heatmap) {
  const weekday = (new Date(`${heatmap.from}T00:00:00Z`).getUTCDay() + 6) % 7;
  const start = offsetDay(heatmap.from, -weekday);
  const columns = Math.ceil((weekday + heatmap.summary.totalDays) / 7);
  const byDay = new Map(heatmap.days.map((day) => [day.day, day]));
  const cells = Array.from({ length: columns * 7 }, (_, index) => {
    const day = offsetDay(start, index);
    return {
      day,
      col: Math.floor(index / 7),
      row: index % 7,
      visible: day >= heatmap.from && day <= heatmap.to,
      tokens: byDay.get(day)?.tokens ?? 0,
    };
  });
  return { columns, cells, start };
}
