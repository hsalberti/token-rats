"use client";

/**
 * Pending-orgs admin panel.
 *
 * Searchable list of orgs waiting on approval. Per-row Approve button
 * promotes status → 'approved' and the requested plan → live plan. Stripe
 * is intentionally not called here; pro-tier orgs still go through manual
 * outreach until billing ships.
 */

import type { AdminPendingOrg } from "@token-rats/contracts";
import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { approveOrg, getPendingOrgs } from "../../lib/api";

interface Props {
  initial: AdminPendingOrg[];
}

export function PendingOrgsPanel({ initial }: Props) {
  const [orgs, setOrgs] = useState<AdminPendingOrg[]>(initial);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runSearch(next: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await getPendingOrgs(next);
      setOrgs(res.orgs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(slug: string) {
    if (!slug) return;
    if (!confirm(`Approve org "${slug}"? This is one-way.`)) return;
    setApproving(slug);
    setError(null);
    try {
      await approveOrg(slug);
      setOrgs((prev) => prev.filter((o) => o.slug !== slug));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval failed");
    } finally {
      setApproving(null);
    }
  }

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold tracking-tight">Pending orgs ({orgs.length})</h2>
      <Card>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void runSearch(query);
          }}
          className="mb-4 flex gap-2"
        >
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name / slug / email / handle"
            className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-rat-500 focus:outline-none"
          />
          <Button type="submit" disabled={loading} size="sm">
            {loading ? "…" : "Search"}
          </Button>
        </form>

        {error && (
          <p className="mb-3 rounded-lg border border-red-800 bg-red-900/20 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}

        {orgs.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-500">No pending orgs match.</p>
        ) : (
          <ul className="divide-y divide-zinc-800">
            {orgs.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-zinc-100">{o.name}</p>
                  <p className="font-mono text-xs text-zinc-500">
                    {o.slug ?? "—"} · @{o.founderHandle || "?"} · {o.founderEmail ?? "(no email)"}
                  </p>
                </div>
                <span className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-zinc-300">
                  {o.requestedPlan ?? "free"}
                </span>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={approving === o.slug || !o.slug}
                  onClick={() => void handleApprove(o.slug ?? "")}
                >
                  {approving === o.slug ? "Approving…" : "Approve"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}
