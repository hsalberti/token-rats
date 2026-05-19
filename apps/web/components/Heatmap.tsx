/**
 * Reusable heatmap grid — v1.2 Track Y.
 *
 * Renders a SVG calendar heatmap from the new HeatmapResponse contract
 * (`cells` are pre-binned server-side using quartiles, so the client just
 * renders the level). Used on /u/[handle], /r/[code], and the OG card
 * routes (where a server-rendered <svg> drops in cleanly).
 *
 * Layout:
 *  - 60-day range → ~9 cols × 7 rows.
 *  - 364-day range → 53 cols × 7 rows (legacy 52-week year view).
 * The grid is anchored so the most recent day sits at the bottom-right.
 */
import type { HeatmapCell } from "@token-rats/contracts";

const CELL = 12;
const GAP = 3;
const ROWS = 7;
const ROW_LABEL_W = 28;
const COL_LABEL_H = 16;

/** Rat-orange ramp. Level 0 is "empty day" zinc-800. */
const COLORS = [
  "#27272a", // 0 — zinc-800
  "#7c2d12", // 1 — rat-900
  "#9a3412", // 2 — rat-800
  "#c2410c", // 3 — rat-700
  "#f97316", // 4 — rat-500
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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
  cells: HeatmapCell[];
  /** Inclusive start date YYYY-MM-DD UTC. */
  from: string;
  /** Inclusive end date YYYY-MM-DD UTC. */
  to: string;
  rangeDays: 60 | 364;
  /** Optional class name on the outer wrapper. */
  className?: string;
}

export function Heatmap({ cells, from: _from, to, rangeDays, className = "" }: HeatmapProps) {
  // 60-day window uses ~9 cols × 7 rows; 364 uses 53 × 7.
  const COLS = rangeDays === 364 ? 53 : Math.ceil(rangeDays / 7);
  void _from;

  // Anchor: the day in `to` is the bottom-right of the grid (this weekday).
  // We render backwards to fill COLS columns of 7 days. column-0 Monday is
  // computed by stepping back from `to` to its Monday, then (COLS - 1) more
  // weeks.
  const toDate = parseUtc(to);
  const toWeekday = (toDate.getUTCDay() + 6) % 7; // 0=Mon..6=Sun
  const firstMonday = new Date(toDate);
  firstMonday.setUTCDate(firstMonday.getUTCDate() - toWeekday - (COLS - 1) * 7);

  const byDate = new Map(cells.map((c) => [c.date, c]));

  type GridCell = { col: number; row: number; date: string; tokens: number; level: number };
  const grid: GridCell[] = [];
  const monthLabels: { col: number; label: string }[] = [];
  let lastMonth = -1;

  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < ROWS; row++) {
      const d = new Date(firstMonday);
      d.setUTCDate(d.getUTCDate() + col * 7 + row);
      if (d > toDate) continue;
      const dateStr = d.toISOString().slice(0, 10);
      const entry = byDate.get(dateStr);
      grid.push({
        col,
        row,
        date: dateStr,
        tokens: entry?.tokens ?? 0,
        level: entry?.level ?? 0,
      });
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
  const maxTokens = cells.reduce((m, c) => Math.max(m, c.tokens), 0);

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-500">Activity</h2>
        <p className="font-mono text-xs text-zinc-500">
          last {rangeDays} days · max day {fmtTokens(maxTokens)} tokens
        </p>
      </div>
      <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950 p-4">
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`Daily token activity for the last ${rangeDays} days`}
          className="block"
        >
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
          {grid.map((cell) => {
            const x = ROW_LABEL_W + cell.col * (CELL + GAP);
            const y = COL_LABEL_H + cell.row * (CELL + GAP);
            const fill = COLORS[cell.level] ?? COLORS[0];
            return (
              <rect
                key={cell.date}
                x={x}
                y={y}
                width={CELL}
                height={CELL}
                rx={2}
                ry={2}
                fill={fill}
              >
                <title>
                  {cell.date} · {fmtTokens(cell.tokens)} tokens
                </title>
              </rect>
            );
          })}
        </svg>
        <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
          <span>Less</span>
          {COLORS.map((c) => (
            <span key={c} className="inline-block h-3 w-3 rounded-sm" style={{ background: c }} />
          ))}
          <span>More</span>
        </div>
      </div>
    </div>
  );
}
