"use client";

import type { ReferralStats } from "@token-rats/contracts";
import { useMemo, useState } from "react";

interface Props {
  initial: ReferralStats;
}

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function ReferralsClient({ initial }: Props) {
  const { code, count, recent } = initial;
  const [copied, setCopied] = useState(false);

  const link = useMemo(() => {
    if (typeof window === "undefined") return `/?ref=${code}`;
    return `${window.location.origin}/?ref=${code}`;
  }, [code]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Ignore — the input is still selectable.
    }
  }

  return (
    <div className="space-y-8">
      <section className="bg-zinc-900 rounded-xl p-5 space-y-4">
        <div>
          <label htmlFor="ref-link" className="block text-sm font-semibold text-zinc-300">
            Your referral link
          </label>
          <p className="text-xs text-zinc-500 mt-1">
            Any friend who signs up through this link will be tracked as referred by you. Add{" "}
            <code className="text-zinc-300">?ref={code}</code> to any Token Rats URL — including a
            room invite — and it does the same thing.
          </p>
        </div>
        <div className="flex items-stretch rounded-lg bg-zinc-950 border border-zinc-800 overflow-hidden">
          <input
            id="ref-link"
            type="text"
            value={link}
            readOnly
            onFocus={(e) => e.currentTarget.select()}
            className="flex-1 bg-transparent px-3 py-2.5 text-sm text-zinc-100 font-mono focus:outline-none"
          />
          <button
            type="button"
            onClick={copyLink}
            className="px-4 text-sm font-semibold text-zinc-100 bg-orange-500 hover:bg-orange-600 transition-colors"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <p className="text-xs text-zinc-500">
          Code: <span className="font-mono text-zinc-300">{code}</span>
        </p>
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Friends invited</h2>
          <span className="text-2xl font-bold text-orange-400">{count}</span>
        </div>

        {recent.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-800 bg-zinc-900/40 px-4 py-8 text-center">
            <p className="text-sm text-zinc-500">No one yet. Share your link to get started.</p>
          </div>
        ) : (
          <ul className="divide-y divide-zinc-800 rounded-lg bg-zinc-900 border border-zinc-800 overflow-hidden">
            {recent.map((r) => (
              <li key={r.handle} className="flex items-center gap-3 px-4 py-3">
                {r.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.avatarUrl} alt="" className="h-8 w-8 rounded-full bg-zinc-800" />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-zinc-800" />
                )}
                <div className="flex-1 min-w-0">
                  <a
                    href={`/u/${r.handle}`}
                    className="text-sm font-medium text-zinc-100 hover:text-orange-400 transition-colors"
                  >
                    @{r.handle}
                  </a>
                </div>
                <span className="text-xs text-zinc-500">{fmtDate(r.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
