/**
 * ProfileHeatmap — GitHub-contributions-style year heatmap for /u/[handle].
 *
 * Driven by GET /v1/u/:handle/heatmap (last 364 days of daily_rollup).
 * Pure SVG so it stays crisp at any zoom and renders identically in OG cards
 * if reused later. No client-side state — server-rendered once per request.
 *
 * Layout: 53 weeks × 7 days. Rows are weekdays (Mon at top to match the
 * /usage screenshot the design originated from). Month labels span the top.
 * Color buckets are computed against the max non-zero day so the legend
 * adapts to the user — a 100-token day on a quiet profile shouldn't look
 * the same as a 100-token day on a power user.
 */
import type { Heatmap } from "@token-rats/contracts";

const CELL = 12;
const GAP = 3;
const ROWS = 7;
const COLS = 53;
const ROW_LABEL_W = 28;
const COL_LABEL_H = 16;

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

export interface ProfileHeatmapProps {
  heatmap: Heatmap;
}

export function ProfileHeatmap({ heatmap }: ProfileHeatmapProps) {
  const byDay = new Map<string, { tokens: number; sessions: number }>();
  for (const d of heatmap.days) byDay.set(d.day, d);
  const maxTokens = heatmap.days.reduce((m, d) => Math.max(m, d.tokens), 0);

  // Anchor: the day in `heatmap.to` is the bottom-right of the grid (this
  // weekday). We render backwards to fill 53 columns of 7 days. We compute
  // the column-0 Monday by stepping back from `to` to its Monday, then
  // 52 weeks further.
  const to = parseUtc(heatmap.to);
  const toWeekday = (to.getUTCDay() + 6) % 7; // 0=Mon..6=Sun
  const firstMonday = new Date(to);
  firstMonday.setUTCDate(firstMonday.getUTCDate() - toWeekday - (COLS - 1) * 7);

  // Build the grid as a flat list of (col, row, day, entry) for SVG iteration.
  type Cell = { col: number; row: number; day: string; tokens: number };
  const cells: Cell[] = [];
  // Month-label positions: emit a label at each col where the month changes
  // on the first row of that column.
  const monthLabels: { col: number; label: string }[] = [];
  let lastMonth = -1;
  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < ROWS; row++) {
      const d = new Date(firstMonday);
      d.setUTCDate(d.getUTCDate() + col * 7 + row);
      if (d > to) continue; // future days
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

  const width = ROW_LABEL_W + COLS * (CELL + GAP);
  const height = COL_LABEL_H + ROWS * (CELL + GAP);

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-500">
          Activity
        </h2>
        <p className="font-mono text-xs text-zinc-500">
          last 364 days · max day {fmtTokens(maxTokens)} tokens
        </p>
      </div>
      <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950 p-4">
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Daily token activity for the last 364 days"
          className="block"
        >
          {/* Month labels */}
          {monthLabels.map((m) => (
            <text
              key={`m-${m.col}`}
              x={ROW_LABEL_W + m.col * (CELL + GAP)}
              y={11}
              fill="#a1a1aa"
              fontSize={10}
              fontFamily="system-ui, sans-serif"
            >
              {m.label}
            </text>
          ))}
          {/* Row labels: Mon, Wed, Fri */}
          {["Mon", "Wed", "Fri"].map((label, i) => (
            <text
              key={label}
              x={0}
              y={COL_LABEL_H + (i * 2 + 1) * (CELL + GAP) - 3}
              fill="#71717a"
              fontSize={10}
              fontFamily="system-ui, sans-serif"
            >
              {label}
            </text>
          ))}
          {/* Cells */}
          {cells.map((cell) => {
            const x = ROW_LABEL_W + cell.col * (CELL + GAP);
            const y = COL_LABEL_H + cell.row * (CELL + GAP);
            const fill = COLORS[bucket(cell.tokens, maxTokens)];
            return (
              <rect
                key={cell.day}
                x={x}
                y={y}
                width={CELL}
                height={CELL}
                rx={2}
                ry={2}
                fill={fill}
              >
                <title>
                  {cell.day} · {fmtTokens(cell.tokens)} tokens
                </title>
              </rect>
            );
          })}
        </svg>
        {/* Legend */}
        <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
          <span>Less</span>
          {COLORS.map((c) => (
            <span
              key={c}
              className="inline-block h-3 w-3 rounded-sm"
              style={{ background: c }}
            />
          ))}
          <span>More</span>
        </div>
      </div>
    </div>
  );
}
