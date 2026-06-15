"use client";

import type { ReferralStats } from "@token-rats/contracts";
import { useState } from "react";

interface Props {
  initial: ReferralStats;
  /** Pre-computed on the server so SSR + client renders match. */
  origin: string;
}

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Invite blurb shared from /settings/referrals. Same `[TR🔶🐭]` brand mark +
 * URL-on-its-own-line layout as the room "Share recap" copy so the two
 * messages read like they came out of the same mouth.
 */
function buildReferralShareText(link: string): string {
  return [
    "[TR🔶🐭] Come burn tokens with me",
    "",
    "Auto-tracked Claude Code, Codex, and Cursor leaderboard with your crew.",
    "",
    link,
  ].join("\n");
}

export function ReferralsClient({ initial, origin }: Props) {
  const { code, count, recent } = initial;
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);

  const link = `${origin}/?ref=${code}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Ignore — the input is still selectable.
    }
  }

  async function shareInvite() {
    const text = buildReferralShareText(link);
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ text });
        return;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setShared(true);
      setTimeout(() => setShared(false), 1500);
    } catch {
      // Ignore — fall back silently.
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
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={shareInvite}
            className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm font-semibold text-zinc-200 hover:border-orange-700 hover:text-orange-400 transition-colors"
          >
            {shared ? "Copied invite" : "Share with a message"}
          </button>
          <p className="text-xs text-zinc-500">
            Code: <span className="font-mono text-zinc-300">{code}</span>
          </p>
        </div>
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
