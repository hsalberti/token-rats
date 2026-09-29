"use client";
import type { CampaignReport } from "@token-rats/contracts";
import { useEffect, useState } from "react";
import { socialRequest } from "../../lib/social";

function percentage(count: number, total: number) {
  return total ? `${((count / total) * 100).toFixed(1)}%` : "—";
}
export function ReleaseCampaigns() {
  const [data, setData] = useState<{
    campaigns: CampaignReport[];
    walkthrough: { seen: number; dismissed: number };
  } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const refresh = () =>
      socialRequest<NonNullable<typeof data>>("releases/campaigns/report")
        .then((result) => {
          if (active) {
            setData(result);
            setError("");
          }
        })
        .catch(() => {
          if (active) setError("Could not load campaign metrics.");
        });
    void refresh();
    const timer = setInterval(refresh, 30_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  return (
    <section
      id="release-campaigns"
      className="mt-10 space-y-5 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 sm:p-6"
    >
      <div>
        <h2 className="text-xl font-bold">Release campaigns</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Updates every 30 seconds · unique recipients · 30-day activation window
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      {!data && !error && <p className="text-sm text-zinc-400">Loading metrics…</p>}
      {data && (
        <p className="text-sm text-zinc-400">
          In-app guide: <strong className="text-zinc-100">{data.walkthrough.seen}</strong> accounts
          shown · {data.walkthrough.dismissed} dismissed
        </p>
      )}
      {data?.campaigns.length === 0 && (
        <p className="text-sm text-zinc-400">No email campaign has been prepared yet.</p>
      )}
      {data?.campaigns.map((c) => (
        <div key={c.id} className="space-y-5 border-t border-zinc-800 pt-5">
          <div className="flex flex-wrap justify-between gap-3">
            <h3 className="font-bold">{c.id}</h3>
            <span className="text-sm capitalize text-rat-400">{c.status}</span>
          </div>
          <p className="text-xs leading-5 text-zinc-400">
            Audience: {c.audienceTotal} accounts · {c.recipients} recipients · {c.missingEmail}{" "}
            without a usable email · {c.excluded} unsubscribed, suppressed, or duplicate addresses
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(
              [
                ["Sent", c.sent, c.recipients, "recipients"],
                ["Delivered", c.delivered, c.sent, "sent"],
                ["Open signals", c.opened, c.sent, "sent"],
                ["CTA clicks", c.clicked, c.sent, "sent"],
                ["Returned", c.returned, c.sent, "sent"],
                ["Returned after click", c.returnedAfterClick, c.sent, "sent"],
                ["New usage trackers", c.newUsage, c.newUsageEligible, "without usage tracker"],
                ["New setup trackers", c.newSetup, c.newSetupEligible, "without setup tracker"],
              ] as const
            ).map(([label, count, total, denominator]) => (
              <div key={label} className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                <p className="text-xs text-zinc-400">{label}</p>
                <p className="mt-2 text-2xl font-black">
                  {count}{" "}
                  <span className="text-sm font-normal text-rat-400">
                    {percentage(count, total)}
                  </span>
                </p>
                <p className="mt-1 text-[11px] leading-4 text-zinc-500">
                  of {total} {denominator}
                </p>
              </div>
            ))}
          </div>
          <p className="text-xs leading-6 text-zinc-400">
            After clicking: {c.newUsageAfterClick} new usage trackers · {c.newSetupAfterClick} new
            setup trackers. Existing usage trackers active after send: {c.existingUsageActive}.
          </p>
          <p className="text-xs leading-6 text-zinc-400">
            Queue: {c.pending} pending · {c.failed} failed · {c.cancelled} cancelled. Delivery:{" "}
            {c.bounced} bounced · {c.complained} complaints · {c.unsubscribed} unsubscribed.
          </p>
        </div>
      ))}
      <p className="text-xs leading-5 text-zinc-500">
        Open signals come from the email provider; image blocking and privacy preloading make them
        approximate. Link scanners can generate clicks. Returns require a signed-in app visit. Usage
        activation requires a device sync or heartbeat; setup activation requires an enabled
        automatic capture. Copying an install command does not count. “New” means no previous
        tracker at the audience snapshot. Activity after an email shows timing, not proof that the
        email caused it.
      </p>
    </section>
  );
}
