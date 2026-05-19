/**
 * /o/[slug]/dashboard — Org spend dashboard (member-only, server component).
 *
 * Aggregates spend by user (top 50), spend by model, and spend by day (last 30d)
 * by pulling /v1/orgs/:slug/dashboard.
 */

import type { OrgSpendByDay, OrgSpendByModel, OrgSpendByUser } from "@token-rats/contracts";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Avatar } from "../../../../components/ui/Avatar";
import { Card } from "../../../../components/ui/Card";
import { Wordmark } from "../../../../components/ui/Wordmark.js";
import { ApiError, getOrgDashboard } from "../../../../lib/api";
import { getCookieHeader } from "../../../../lib/auth";
import { getOrgMembership } from "../../../../lib/org-auth";

export const runtime = "edge";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Dashboard — ${slug}` };
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

export default async function OrgDashboardPage({ params }: Props) {
  const { slug } = await params;
  const cookieHeader = await getCookieHeader();

  const membership = await getOrgMembership(slug, cookieHeader);
  if (!membership) notFound();

  let dashboard: {
    spendByUser: OrgSpendByUser[];
    spendByModel: OrgSpendByModel[];
    spendByDay: OrgSpendByDay[];
  };
  try {
    const data = await getOrgDashboard(slug, cookieHeader);
    dashboard = data.dashboard;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const { spendByUser, spendByModel, spendByDay } = dashboard;
  const { org } = membership;

  // Total tokens and cost across all users in the 30d window
  const totalCents = spendByUser.reduce((s, r) => s + r.costUsdCents, 0);
  const totalTokens = spendByUser.reduce((s, r) => s + r.tokens, 0);

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <a href={`/o/${slug}`} className="text-sm text-zinc-500 hover:text-zinc-300">
            ← {org.name}
          </a>
          <a href="/">
            <Wordmark size="md" />
          </a>
          <div className="w-16" />
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8 space-y-8">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Spend dashboard</h1>
          <p className="mt-1 text-zinc-500">Last 30 days · {org.name}</p>
        </div>

        {/* Summary row */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
              Total spend
            </p>
            <p className="mt-2 text-3xl font-black text-rat-400">{fmtCost(totalCents)}</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
              Total tokens
            </p>
            <p className="mt-2 text-3xl font-black text-zinc-100">{fmtTokens(totalTokens)}</p>
          </div>
        </div>

        {/* Spend by user */}
        <Card>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-zinc-500">
            Spend by person (top 50)
          </h2>
          {spendByUser.length === 0 ? (
            <p className="text-zinc-500">No data yet.</p>
          ) : (
            <ol className="space-y-3">
              {spendByUser.map((row, i) => (
                <li key={row.userId} className="flex items-center gap-3">
                  <span className="w-6 text-right text-sm font-bold text-zinc-600">{i + 1}</span>
                  <Avatar src={row.avatarUrl} handle={row.handle} size="sm" />
                  <span className="flex-1 font-semibold">@{row.handle}</span>
                  <span className="font-mono text-sm text-zinc-400">{fmtTokens(row.tokens)}</span>
                  <span className="w-20 text-right font-mono text-sm font-bold text-rat-400">
                    {fmtCost(row.costUsdCents)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>

        {/* Spend by model */}
        <Card>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-zinc-500">
            Spend by model
          </h2>
          {spendByModel.length === 0 ? (
            <p className="text-zinc-500">No data yet.</p>
          ) : (
            <ul className="space-y-2">
              {spendByModel.map((row) => (
                <li key={row.model} className="flex items-center gap-3">
                  <span className="flex-1 font-mono text-sm text-zinc-300">{row.model}</span>
                  <span className="font-mono text-sm text-zinc-400">{fmtTokens(row.tokens)}</span>
                  <span className="w-20 text-right font-mono text-sm font-bold text-rat-400">
                    {fmtCost(row.costUsdCents)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Spend by day (simple text table, no third-party chart lib) */}
        <Card>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-zinc-500">
            Daily spend (last 30 days)
          </h2>
          {spendByDay.length === 0 ? (
            <p className="text-zinc-500">No data yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {spendByDay.map((row) => {
                const pct = totalCents > 0 ? Math.round((row.costUsdCents / totalCents) * 100) : 0;
                return (
                  <li key={row.day} className="flex items-center gap-3">
                    <span className="w-24 font-mono text-xs text-zinc-500">{row.day}</span>
                    <div className="flex-1 rounded-full bg-zinc-800 h-2 overflow-hidden">
                      <div
                        className="h-full bg-rat-500 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-20 text-right font-mono text-sm font-bold text-rat-400">
                      {fmtCost(row.costUsdCents)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </main>
    </div>
  );
}
