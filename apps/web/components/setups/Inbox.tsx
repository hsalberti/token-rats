"use client";
import type { SocialNotice, SocialPrefs } from "@token-rats/contracts";
import { useState } from "react";
import { socialRequest } from "../../lib/social";
import { ReleaseGuideLink } from "../ReleaseGuide";
export function Inbox({
  initial,
  prefs: initialPrefs,
  emailConfigured,
  productEmails: initialProductEmails,
}: {
  initial: SocialNotice[];
  prefs: SocialPrefs;
  emailConfigured: boolean;
  productEmails: boolean;
}) {
  const [productEmails, setProductEmails] = useState(initialProductEmails);
  const [notices, setNotices] = useState(initial);
  const [prefs, setPrefs] = useState(initialPrefs);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  async function update(key: keyof SocialPrefs, value: boolean) {
    setBusy(true);
    try {
      const next = { ...prefs, [key]: value };
      await socialRequest("social/preferences", { method: "PUT", body: JSON.stringify(next) });
      setPrefs(next);
      setStatus("Preferences saved.");
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function read() {
    try {
      await socialRequest("social/read", { method: "POST" });
      setNotices(notices.map((n) => ({ ...n, readAt: Date.now() })));
    } catch (e) {
      setStatus((e as Error).message);
    }
  }
  return (
    <div className="grid gap-8 md:grid-cols-[1fr_300px]">
      <section>
        <div className="mb-5 flex justify-between gap-4">
          <h1 className="text-3xl font-black">Inbox</h1>
          <button type="button" onClick={read} className="text-sm text-rat-400">
            Mark all read
          </button>
        </div>
        <div className="space-y-3">
          <ReleaseGuideLink />
          {notices.map((n) => (
            <a
              key={n.id}
              href={n.href}
              className={`block rounded-xl border p-5 ${n.readAt ? "border-zinc-800" : "border-rat-500/40 bg-rat-500/5"}`}
            >
              <p className="text-sm leading-6">{n.title}</p>
              <p className="mt-2 text-xs text-zinc-500">
                {new Date(n.createdAt).toISOString().slice(0, 10)}
              </p>
            </a>
          ))}
          {!notices.length && (
            <p className="rounded-xl border border-dashed border-zinc-700 p-8 text-sm leading-6 text-zinc-400">
              Follow people to hear when they share a setup or reach their first monthly token
              milestones.
            </p>
          )}
        </div>
      </section>
      <aside className="h-fit space-y-5 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <h2 className="font-bold">Notification preferences</h2>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={productEmails}
            disabled={busy}
            className="mt-1"
            onChange={async (e) => {
              const enabled = e.target.checked;
              setProductEmails(enabled);
              setBusy(true);
              try {
                await socialRequest("releases/preferences", {
                  method: "PUT",
                  body: JSON.stringify({ productEmails: enabled }),
                });
                setProductEmails(enabled);
                setStatus("Preferences saved.");
              } catch (error) {
                setProductEmails(!enabled);
                setStatus((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          />
          <span>
            Product update emails
            <span className="mt-1 block text-xs leading-5 text-zinc-500">
              Occasional release announcements and invitations to try new features.
            </span>
          </span>
        </label>
        {(
          [
            [
              "inApp",
              "Updates in my inbox",
              "New setups and first monthly milestones from people I follow.",
            ],
            [
              "setupEmails",
              "Email me new setups",
              "Get an email when someone I follow shares a version.",
            ],
            [
              "milestoneEmails",
              "Email me milestones",
              "First time reaching 1M, 10M, or 100M tokens in a calendar month.",
            ],
            [
              "shareMilestones",
              "Share my milestones",
              "Let my followers hear when I reach these monthly totals for the first time.",
            ],
          ] as const
        ).map(([key, label, help]) => (
          <label key={key} className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              disabled={
                busy || (!emailConfigured && (key === "setupEmails" || key === "milestoneEmails"))
              }
              checked={prefs[key]}
              onChange={(e) => update(key, e.target.checked)}
              className="mt-1"
            />
            <span>
              {label}
              <span className="mt-1 block text-xs leading-5 text-zinc-500">{help}</span>
            </span>
          </label>
        ))}
        {!emailConfigured && (
          <p className="text-xs text-amber-400">
            Email notifications are coming later. Updates are available in your app inbox.
          </p>
        )}
        <p className="text-xs text-zinc-500">
          Calendar months use UTC. Each milestone is shared once, even if you reach it again next
          month.
        </p>
        {status && <output className="text-sm text-rat-400">{status}</output>}
      </aside>
    </div>
  );
}
