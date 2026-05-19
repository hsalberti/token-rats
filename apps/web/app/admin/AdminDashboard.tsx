/**
 * Admin launch dashboard.
 *
 * Receives pre-fetched metric payloads from the server component. No client
 * fetching is needed for first render; the data is fresh per request.
 *
 * The signup line chart is a hand-rolled inline SVG (no chart lib) — it's a
 * single viz of a tiny 30-point series; adding a dep would be overkill.
 */
import type {
  AdminActivityResponse,
  AdminReferrersResponse,
  AdminSignupsResponse,
  GetPendingOrgsResponse,
} from "@token-rats/contracts";
import { Card } from "../../components/ui/Card";
import { PendingOrgsPanel } from "./PendingOrgsPanel";

interface Props {
  signups: AdminSignupsResponse;
  activity: AdminActivityResponse;
  referrers: AdminReferrersResponse;
  pendingOrgs: GetPendingOrgsResponse;
}

export function AdminDashboard({ signups, activity, referrers, pendingOrgs }: Props) {
  const generated = new Date(signups.generatedAt);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-black tracking-tight">Launch dashboard</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Read-only view of signup, activity, and source signals. Generated{" "}
          <time dateTime={generated.toISOString()}>{generated.toUTCString()}</time>.
        </p>
      </div>

      <PendingOrgsPanel initial={pendingOrgs.orgs} />
      <SignupsSection data={signups} />
      <ActivitySection data={activity} />
      <ReferrersSection data={referrers} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Signups                                                                     */
/* -------------------------------------------------------------------------- */

function SignupsSection({ data }: { data: AdminSignupsResponse }) {
  const windowNew = data.series.reduce((acc, d) => acc + d.newUsers, 0);
  const first = data.series[0];
  const last = data.series[data.series.length - 1];

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold tracking-tight">Signups</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total users" value={data.totalUsers.toLocaleString()} />
        <StatCard label="New in last 30 days" value={windowNew.toLocaleString()} />
        <StatCard
          label="Window"
          value={
            first && last ? (
              <span className="font-mono text-base">
                {first.day} → {last.day}
              </span>
            ) : (
              "—"
            )
          }
        />
      </div>
      <Card>
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-zinc-400">
          Cumulative signups (30d)
        </h3>
        {data.series.length > 0 ? (
          <CumulativeChart series={data.series} />
        ) : (
          <p className="text-sm text-zinc-500">No data.</p>
        )}
      </Card>
    </section>
  );
}

/**
 * Inline SVG line chart for cumulative signups.
 *
 * - 30 x-axis points, equally spaced.
 * - y-axis scales from min..max with a small padding band.
 * - Renders an area fill under the line, hover-friendly tick dots, and three
 *   y-axis labels (min / mid / max). No external library.
 */
function CumulativeChart({ series }: { series: AdminSignupsResponse["series"] }) {
  const width = 720;
  const height = 220;
  const padL = 44;
  const padR = 16;
  const padT = 16;
  const padB = 28;

  const values = series.map((d) => d.cumulative);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const range = Math.max(1, maxV - minV);

  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  function x(i: number): number {
    if (series.length <= 1) return padL + innerW / 2;
    return padL + (i / (series.length - 1)) * innerW;
  }
  function y(v: number): number {
    return padT + innerH - ((v - minV) / range) * innerH;
  }

  const linePath = series
    .map((d, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(2)} ${y(d.cumulative).toFixed(2)}`)
    .join(" ");
  const lastX = x(series.length - 1);
  const areaPath = `${linePath} L ${lastX.toFixed(2)} ${padT + innerH} L ${padL} ${padT + innerH} Z`;

  const midV = Math.round((minV + maxV) / 2);
  const tickLabels = [
    { v: maxV, y: y(maxV) },
    { v: midV, y: y(midV) },
    { v: minV, y: y(minV) },
  ];

  // X-axis labels: first, ~middle, last
  const firstD = series[0];
  const lastD = series[series.length - 1];
  const midIdx = Math.floor((series.length - 1) / 2);
  const midD = series[midIdx];

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Cumulative signups over the last 30 days"
        className="block h-auto w-full min-w-[480px]"
      >
        {/* React 19 hoists nested <title> to <head>; aria-label on <svg> above
            already covers accessibility. */}
        {/* Gridlines */}
        {tickLabels.map((t) => (
          <line
            key={t.v}
            x1={padL}
            x2={width - padR}
            y1={t.y}
            y2={t.y}
            stroke="rgb(39 39 42)"
            strokeWidth={1}
          />
        ))}
        {/* Area under curve */}
        <path d={areaPath} fill="rgb(249 115 22 / 0.12)" />
        {/* Line */}
        <path
          d={linePath}
          fill="none"
          stroke="rgb(249 115 22)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Points */}
        {series.map((d, i) => (
          <circle
            key={d.day}
            cx={x(i)}
            cy={y(d.cumulative)}
            r={2.5}
            fill="rgb(249 115 22)"
            aria-label={`${d.day}: ${d.cumulative} total (${
              d.newUsers > 0 ? `+${d.newUsers}` : "no change"
            })`}
          />
        ))}
        {/* Y-axis labels */}
        {tickLabels.map((t) => (
          <text
            key={`label-${t.v}`}
            x={padL - 6}
            y={t.y + 4}
            textAnchor="end"
            className="fill-zinc-500"
            fontSize="11"
            fontFamily="ui-monospace, monospace"
          >
            {t.v}
          </text>
        ))}
        {/* X-axis labels */}
        {firstD && (
          <text
            x={padL}
            y={height - 8}
            className="fill-zinc-500"
            fontSize="11"
            fontFamily="ui-monospace, monospace"
          >
            {firstD.day}
          </text>
        )}
        {midD && (
          <text
            x={padL + innerW / 2}
            y={height - 8}
            textAnchor="middle"
            className="fill-zinc-500"
            fontSize="11"
            fontFamily="ui-monospace, monospace"
          >
            {midD.day}
          </text>
        )}
        {lastD && (
          <text
            x={width - padR}
            y={height - 8}
            textAnchor="end"
            className="fill-zinc-500"
            fontSize="11"
            fontFamily="ui-monospace, monospace"
          >
            {lastD.day}
          </text>
        )}
      </svg>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Activity                                                                    */
/* -------------------------------------------------------------------------- */

function ActivitySection({ data }: { data: AdminActivityResponse }) {
  const peak = data.series.reduce((acc, d) => (d.activeUsers > acc.activeUsers ? d : acc), {
    day: "—",
    activeUsers: 0,
  });
  const avg = data.series.length
    ? Math.round(data.series.reduce((acc, d) => acc + d.activeUsers, 0) / data.series.length)
    : 0;
  const maxBar = Math.max(1, ...data.series.map((d) => d.activeUsers));

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold tracking-tight">Daily accesses</h2>
      <p className="-mt-2 text-sm text-zinc-500">
        &quot;Active&quot; = distinct users who synced at least one session via the CLI on that UTC
        day. Login events and web views are not persisted server-side, so CLI sync is the strongest
        activity signal available.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Active in last 30 days" value={data.activeUsers30d.toLocaleString()} />
        <StatCard label="Daily average" value={avg.toLocaleString()} />
        <StatCard
          label="Peak day"
          value={
            <span className="text-base">
              {peak.activeUsers.toLocaleString()}{" "}
              <span className="text-sm font-normal text-zinc-500">on {peak.day}</span>
            </span>
          }
        />
      </div>
      <Card>
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-zinc-400">
          Active users per day
        </h3>
        {data.series.length > 0 ? (
          <div className="flex items-end gap-1" style={{ height: 160 }}>
            {data.series.map((d) => {
              const heightPct = (d.activeUsers / maxBar) * 100;
              return (
                <div
                  key={d.day}
                  className="group flex-1"
                  style={{ height: "100%", display: "flex", alignItems: "flex-end" }}
                >
                  <div
                    className="w-full rounded-t bg-rat-500/80 transition-colors group-hover:bg-rat-400"
                    style={{ height: `${Math.max(2, heightPct)}%` }}
                    title={`${d.day}: ${d.activeUsers} active`}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">No data.</p>
        )}
        <div className="mt-2 flex justify-between font-mono text-xs text-zinc-500">
          <span>{data.series[0]?.day ?? ""}</span>
          <span>{data.series[data.series.length - 1]?.day ?? ""}</span>
        </div>
      </Card>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Referrers                                                                   */
/* -------------------------------------------------------------------------- */

function ReferrersSection({ data }: { data: AdminReferrersResponse }) {
  const top = data.rows[0]?.count ?? 0;

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold tracking-tight">Top referrers</h2>
      <p className="text-sm text-zinc-400">
        Signups brought in via a <code className="rounded bg-zinc-800 px-1">?ref=</code> link.
      </p>
      <Card>
        {data.rows.length === 0 ? (
          <p className="text-sm text-zinc-500">No referrals yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-800">
            {data.rows.map((r, idx) => {
              const pct = top > 0 ? Math.round((r.count / top) * 100) : 0;
              return (
                <li key={r.handle} className="flex items-center gap-3 py-3">
                  <span className="w-6 text-right font-mono text-xs text-zinc-500">{idx + 1}</span>
                  {r.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.avatarUrl} alt="" className="h-7 w-7 rounded-full bg-zinc-800" />
                  ) : (
                    <div className="h-7 w-7 rounded-full bg-zinc-800" />
                  )}
                  <a
                    href={`/u/${r.handle}`}
                    className="flex-1 truncate font-mono text-sm text-zinc-200 hover:text-orange-400"
                  >
                    @{r.handle}
                  </a>
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-32 overflow-hidden rounded-full bg-zinc-800">
                      <div className="h-full bg-rat-500" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-12 text-right font-mono text-sm font-bold">
                      {r.count.toLocaleString()}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Bits                                                                        */
/* -------------------------------------------------------------------------- */

function StatCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card padding="md">
      <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-black tracking-tight text-zinc-100">{value}</p>
    </Card>
  );
}
