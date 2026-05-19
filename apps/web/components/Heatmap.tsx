/**
 * Heatmap — GitHub-contributions-style activity grid, shared by /u/[handle]
 * and /r/[code].
 *
 * `range="52w"` renders the year view (53 weeks × 7 days, ~364 cells).
 * `range="30d"` renders a wide strip — 30 days laid out as 10 columns × 3
 * rows, filled column-major so the rightmost column holds the most recent
 * 3 days and the bottom-right cell is today. Rows do not represent
 * weekdays. Bucket + color logic is shared.
 *
 * Driven by GET /v1/u/:handle/heatmap?range= or GET /v1/r/:code/heatmap?range=.
 * Pure SVG so it stays crisp at any zoom and renders identically in OG cards
 * if reused later.
 */
import type { Heatmap as HeatmapData, HeatmapRange } from "@token-rats/contracts";

const COLORS = [
  "#27272a", // 0 — zinc-800
  "#7c2d12", // 1 — rat-900
  "#9a3412", // 2 — rat-800
  "#c2410c", // 3 — rat-700
  "#f97316", // 4 — rat-500
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function bucket(tokens: number, max: number): number {
  if (tokens === 0 || max === 0) return 0;
  const ratio = tokens / max;
  if (ratio > 0.66) return 4;
  if (ratio > 0.33) return 3;
  if (ratio > 0.1) return 2;
  return 1;
}

function parseUtc(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return `${n}`;
}

export interface HeatmapProps {
  heatmap: HeatmapData;
  /**
   * Explicit override for the rendered range. Defaults to `heatmap.range`
   * for backward-compatibility — pass this when the parent is mid-toggle and
   * wants the layout to follow the new range even before the new data lands.
   */
  range?: HeatmapRange;
  title?: string;
}

export function Heatmap({ heatmap, range: rangeProp, title = "Activity" }: HeatmapProps) {
  const range = rangeProp ?? heatmap.range;
  return range === "52w" ? (
    <YearView heatmap={heatmap} title={title} />
  ) : (
    <ThirtyDayView heatmap={heatmap} title={title} />
  );
}

/* ------------------------------ 52-week view ------------------------------ */

const CELL = 12;
const GAP = 3;
const Y_ROWS = 7;
const Y_COLS = 53;
const Y_ROW_LABEL_W = 28;
const Y_COL_LABEL_H = 16;

function YearView({ heatmap, title }: { heatmap: HeatmapData; title: string }) {
  const byDay = new Map<string, { tokens: number; sessions: number }>();
  for (const d of heatmap.days) byDay.set(d.day, d);
  const maxTokens = heatmap.days.reduce((m, d) => Math.max(m, d.tokens), 0);

  const to = parseUtc(heatmap.to);
  const toWeekday = (to.getUTCDay() + 6) % 7; // 0=Mon..6=Sun
  const firstMonday = new Date(to);
  firstMonday.setUTCDate(firstMonday.getUTCDate() - toWeekday - (Y_COLS - 1) * 7);

  type Cell = { col: number; row: number; day: string; tokens: number };
  const cells: Cell[] = [];
  const monthLabels: { col: number; label: string }[] = [];
  let lastMonth = -1;
  for (let col = 0; col < Y_COLS; col++) {
    for (let row = 0; row < Y_ROWS; row++) {
      const d = new Date(firstMonday);
      d.setUTCDate(d.getUTCDate() + col * 7 + row);
      if (d > to) continue;
      const dayStr = d.toISOString().slice(0, 10);
      const entry = byDay.get(dayStr);
      cells.push({ col, row, day: dayStr, tokens: entry?.tokens ?? 0 });
      if (row === 0) {
        const m = d.getUTCMonth();
        if (m !== lastMonth) {
          monthLabels.push({ col, label: MONTHS[m] ?? "" });
          lastMonth = m;
        }
      }
    }
  }

  const width = Y_ROW_LABEL_W + Y_COLS * (CELL + GAP);
  const height = Y_COL_LABEL_H + Y_ROWS * (CELL + GAP);

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-500">{title}</h2>
        <p className="font-mono text-xs text-zinc-500">
          last 52 weeks · max day {fmtTokens(maxTokens)} tokens
        </p>
      </div>
      <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950 p-4">
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`${title.toLowerCase()} for the last 52 weeks`}
          className="block"
        >
          {monthLabels.map((m) => (
            <text
              key={`m-${m.col}`}
              x={Y_ROW_LABEL_W + m.col * (CELL + GAP)}
              y={11}
              fill="#a1a1aa"
              fontSize={10}
              fontFamily="system-ui, sans-serif"
            >
              {m.label}
            </text>
          ))}
          {["Mon", "Wed", "Fri"].map((label, i) => (
            <text
              key={label}
              x={0}
              y={Y_COL_LABEL_H + (i * 2 + 1) * (CELL + GAP) - 3}
              fill="#71717a"
              fontSize={10}
              fontFamily="system-ui, sans-serif"
            >
              {label}
            </text>
          ))}
          {cells.map((cell) => {
            const x = Y_ROW_LABEL_W + cell.col * (CELL + GAP);
            const y = Y_COL_LABEL_H + cell.row * (CELL + GAP);
            const fill = COLORS[bucket(cell.tokens, maxTokens)];
            return (
              <rect key={cell.day} x={x} y={y} width={CELL} height={CELL} rx={2} ry={2} fill={fill}>
                <title>
                  {cell.day} · {fmtTokens(cell.tokens)} tokens
                </title>
              </rect>
            );
          })}
        </svg>
        <Legend />
      </div>
    </div>
  );
}

/* ------------------------------- 30-day view ------------------------------ */
/* Layout: 10 columns × 3 rows, filled column-major. Oldest day sits top-left,*/
/* newest day bottom-right; the rightmost column is the most recent 3 days.  */

const T_CELL = 24;
const T_GAP = 6;
const T_COLS = 10;
const T_ROWS = 3;

function ThirtyDayView({ heatmap, title }: { heatmap: HeatmapData; title: string }) {
  const byDay = new Map<string, { tokens: number; sessions: number }>();
  for (const d of heatmap.days) byDay.set(d.day, d);

  const to = parseUtc(heatmap.to);
  // 30 days, column-major: i=0 is the oldest day (top-left of leftmost column),
  // i=29 is today (bottom-right of rightmost column).
  const cells: { col: number; row: number; day: string; tokens: number }[] = [];
  let maxTokens = 0;
  for (let i = 0; i < 30; i++) {
    const d = new Date(to);
    d.setUTCDate(d.getUTCDate() - (29 - i));
    const dayStr = d.toISOString().slice(0, 10);
    const tokens = byDay.get(dayStr)?.tokens ?? 0;
    if (tokens > maxTokens) maxTokens = tokens;
    cells.push({
      col: Math.floor(i / T_ROWS),
      row: i % T_ROWS,
      day: dayStr,
      tokens,
    });
  }

  const width = T_COLS * (T_CELL + T_GAP);
  const height = T_ROWS * (T_CELL + T_GAP);

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-500">{title}</h2>
        <p className="font-mono text-xs text-zinc-500">
          last 30 days · max day {fmtTokens(maxTokens)} tokens
        </p>
      </div>
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`${title.toLowerCase()} for the last 30 days`}
          className="block"
        >
          {cells.map((cell) => {
            const x = cell.col * (T_CELL + T_GAP);
            const y = cell.row * (T_CELL + T_GAP);
            const fill = COLORS[bucket(cell.tokens, maxTokens)];
            return (
              <rect
                key={cell.day}
                x={x}
                y={y}
                width={T_CELL}
                height={T_CELL}
                rx={4}
                ry={4}
                fill={fill}
              >
                <title>
                  {cell.day} · {fmtTokens(cell.tokens)} tokens
                </title>
              </rect>
            );
          })}
        </svg>
        <Legend />
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
      <span>Less</span>
      {COLORS.map((c) => (
        <span key={c} className="inline-block h-3 w-3 rounded-sm" style={{ background: c }} />
      ))}
      <span>More</span>
    </div>
  );
}
