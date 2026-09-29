"use client";
import type { SetupWatcher } from "@token-rats/contracts";
import { useEffect, useState } from "react";
import { socialRequest } from "../../lib/social";
import { FRIENDS_DESCRIPTION } from "./Audience";

const COMMAND = "npx token-rats@latest setup-track";
export function AutomaticCapture({ initial = [] }: { initial?: SetupWatcher[] }) {
  const [watchers, setWatchers] = useState(initial);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    let cancelled = false;
    const timer = setInterval(() => {
      socialRequest<{ watchers: SetupWatcher[] }>("setups/watchers")
        .then((result) => {
          if (!cancelled) {
            setWatchers(result.watchers);
            setNow(Date.now());
          }
        })
        .catch(() => {});
    }, 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);
  async function toggle(watcher: SetupWatcher) {
    setBusy(watcher.id);
    setError("");
    try {
      const result = await socialRequest<{ watcher: SetupWatcher }>(
        `setups/watchers/${watcher.id}`,
        {
          method: "PUT",
          body: JSON.stringify({ enabled: !watcher.enabled }),
        },
      );
      setWatchers((items) => items.map((w) => (w.id === watcher.id ? result.watcher : w)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <section
      id="automatic"
      aria-label="Automatic capture"
      className="scroll-mt-6 rounded-2xl border border-rat-500/30 bg-rat-500/5 p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">Edit locally. Share with friends.</h2>
        <span className="rounded-full border border-rat-500/40 px-3 py-1 text-xs text-rat-400">
          Friends only
        </span>
      </div>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300">
        Your global AGENTS.md becomes a living history. Once enabled, saved changes appear on your
        profile and in your friends’ feeds, usually within a minute while your tracker is running.
      </p>
      <p className="mt-2 text-sm leading-6 text-zinc-400">
        {FRIENDS_DESCRIPTION}{" "}
        <a href="/app/friends" className="text-rat-400 underline">
          See who can read your history.
        </a>
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-zinc-700 bg-zinc-950 p-3">
        <code className="min-w-0 flex-1 break-all text-sm text-zinc-100">{COMMAND}</code>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(COMMAND);
              setMessage("Copied. Run it in your terminal to preview and enable sharing.");
            } catch {
              setMessage("Select and copy the command above.");
            }
          }}
          className="rounded-lg bg-rat-500 px-3 py-2 text-sm font-bold text-black"
        >
          Copy command
        </button>
      </div>
      <p className="mt-3 text-xs leading-5 text-zinc-400">
        Run once on your computer. Preview the files, confirm, and the background tracker takes care
        of future edits. It also syncs token usage. Codex and OpenCode global instructions are
        detected; add a file path to choose another file.
      </p>
      <details className="mt-3 text-xs leading-5 text-zinc-400">
        <summary className="cursor-pointer text-zinc-300">What gets shared?</summary>
        <p className="mt-2">
          Only the instruction files you enable. Common credential patterns are omitted, but review
          the preview for other private details. Wrap sections you want excluded in{" "}
          <code>&lt;!-- token-rats:private --&gt;</code> and{" "}
          <code>&lt;!-- /token-rats:private --&gt;</code>. Future edits inside those sections stay
          on your machine.
        </p>
        <p className="mt-2">
          Current and future friends can read shared versions. Pausing stops new captures; saved
          history keeps its audience. Open a version to make it “Only me,” or delete the setup to
          remove its history.
        </p>
      </details>
      {message && <output className="mt-3 block text-sm text-rat-400">{message}</output>}
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-400">
          {error}
        </p>
      )}
      {watchers.length > 0 && (
        <ul className="mt-5 divide-y divide-zinc-800 border-t border-zinc-800">
          {watchers.map((w) => (
            <li key={w.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div className="min-w-0">
                <p className="font-semibold">{w.label}</p>
                <p className={`mt-1 text-xs ${w.error ? "text-amber-400" : "text-zinc-400"}`}>
                  {!w.enabled
                    ? "Paused · saved history keeps its audience"
                    : w.error
                      ? `Needs attention: ${w.error}`
                      : now !== null && now - w.lastSeenAt > 120_000
                        ? "Waiting for your computer · run the command above if the tracker is stopped"
                        : "Tracking · friends only"}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  Last check: {new Date(w.lastSeenAt).toISOString().slice(0, 16).replace("T", " ")}{" "}
                  UTC
                </p>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <a href={`/setups/${w.setupId}`} className="text-rat-400">
                  View history →
                </a>
                <button
                  type="button"
                  disabled={busy === w.id}
                  onClick={() => toggle(w)}
                  className="rounded-lg border border-zinc-700 px-3 py-2 disabled:opacity-50"
                >
                  {w.enabled ? "Pause" : "Resume"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
