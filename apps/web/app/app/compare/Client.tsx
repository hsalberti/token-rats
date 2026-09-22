"use client";
import { getComparison, saveSubscription } from "@/lib/api";
import type { ComparisonResponse, SourceComparison } from "@token-rats/contracts";
import { useEffect, useState } from "react";

const labels: Record<string, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
};
const number = (value: number) => value.toLocaleString("en-US");
const dollars = (value: number) => `$${value.toFixed(2)}`;
export function ComparisonClient() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<ComparisonResponse | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    getComparison(month)
      .then((result) => {
        if (active) setData(result);
      })
      .catch(() => {
        if (active) setError("Could not load usage. Try another month or reload.");
      });
    return () => {
      active = false;
    };
  }, [month]);
  return (
    <div className="space-y-6">
      <label className="block">
        Calendar month (UTC)
        <input
          type="month"
          required
          value={month}
          onChange={(e) => {
            if (e.target.value) setMonth(e.target.value);
          }}
          className="ml-3 rounded border border-zinc-700 bg-zinc-900 p-2"
        />
      </label>
      {error && (
        <p role="alert" className="text-red-400">
          {error}
        </p>
      )}
      {!data && !error && <p>Loading usage…</p>}
      {data && (
        <div className="grid gap-4 md:grid-cols-3">
          {data.sources.map((source) => (
            <SourceCard key={`${month}:${source.source}`} source={source} month={month} />
          ))}
        </div>
      )}
      <div className="rounded-xl border border-zinc-800 p-5 text-sm text-zinc-400 space-y-2">
        <p>
          Counts include uncached input, cache reads, cache writes, and output. Reasoning is part of
          output and is shown separately.
        </p>
        <p>
          Only local CLI and IDE records enter this comparison. API proxy usage is excluded. Missing
          logs cannot be recovered from your subscription account.
        </p>
        <p>
          Cursor counts are estimates. Unknown model or cache prices are shown as unpriced.
          Estimates use the stored price for the session date. Taxes, plan limits, special rates,
          and provider credits are not included.
        </p>
        <p>
          Long sessions are assigned to their start date and last recorded model. A month with no
          records means no recorded usage, not proof that the subscription was unused.
        </p>
      </div>
    </div>
  );
}
function SourceCard({ source, month }: { source: SourceComparison; month: string }) {
  const [plan, setPlan] = useState(source.subscription?.label ?? "");
  const [paid, setPaid] = useState(
    source.subscription ? String(source.subscription.paidUsdCents / 100) : "",
  );
  const [savedPaid, setSavedPaid] = useState<number | null>(
    source.subscription?.paidUsdCents ?? null,
  );
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const total =
    source.inTokens + source.outTokens + source.cacheReadTokens + source.cacheWriteTokens;
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-4">
      <h2 className="text-xl font-bold">{labels[source.source]}</h2>
      <p className="text-xs text-zinc-400">
        {source.tokensEstimated ? "Estimated tokens" : "Tokens reported by local logs"}
      </p>
      <p className="text-3xl font-mono">
        {number(total)}
        <span className="block text-sm text-zinc-400">total tokens</span>
      </p>
      <dl className="text-sm space-y-2">
        {[
          ["Uncached input", source.inTokens],
          ["Cache reads", source.cacheReadTokens],
          ["Cache writes", source.cacheWriteTokens],
          ["Output", source.outTokens],
          ["Reasoning (within output)", source.reasoningTokens],
          ["Active days", source.activeDays],
          ["Session records", source.sessions],
        ].map(([label, value]) => (
          <div key={label} className="flex justify-between gap-2">
            <dt className="text-zinc-400">{label}</dt>
            <dd>{number(Number(value))}</dd>
          </div>
        ))}
        <div>
          <dt className="text-zinc-400">
            Estimated API cost {source.unpricedSessions > 0 ? "(partial)" : ""}
          </dt>
          <dd className="text-xl">{dollars(source.estimatedApiUsd)}</dd>
        </div>
        {source.unpricedSessions > 0 && (
          <div className="text-amber-400">
            {source.unpricedSessions} records have incomplete prices.
          </div>
        )}
        {savedPaid !== null && (
          <div>
            <dt className="text-zinc-400">Subscription amount entered</dt>
            <dd>{dollars(savedPaid / 100)}</dd>
          </div>
        )}
        {savedPaid !== null && savedPaid > 0 && (
          <div>
            <dt className="text-zinc-400">Recorded tokens per USD paid</dt>
            <dd>{number(Math.round(total / (savedPaid / 100)))}</dd>
          </div>
        )}
      </dl>
      <form
        className="space-y-3 border-t border-zinc-800 pt-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setStatus("");
          try {
            const cents = Math.round(Number(paid) * 100);
            await saveSubscription({
              month,
              source: source.source,
              label: plan,
              paidUsdCents: cents,
            });
            setSavedPaid(cents);
            setStatus("Saved for this month.");
          } catch {
            setStatus("Could not save. Check the amount and try again.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="block text-sm">
          Plan name
          <input
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            required
            maxLength={80}
            className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 p-2"
          />
        </label>
        <label className="block text-sm">
          Amount paid (USD)
          <input
            type="number"
            min="0"
            max="1000000"
            step="0.01"
            value={paid}
            onChange={(e) => setPaid(e.target.value)}
            required
            className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 p-2"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-rat-600 px-3 py-2 text-sm disabled:opacity-50"
        >
          Save subscription amount
        </button>
        {status && <output className="text-sm text-zinc-400">{status}</output>}
      </form>
    </section>
  );
}
