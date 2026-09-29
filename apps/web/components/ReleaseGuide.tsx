"use client";
import { CURRENT_RELEASE } from "@token-rats/contracts";
import { useEffect, useRef, useState } from "react";
import { socialRequest } from "../lib/social";

const OPEN_EVENT = "token-rats:release-guide";
export function ReleaseGuideLink() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
      className="mb-5 block w-full rounded-xl border border-rat-500/40 bg-rat-500/5 p-5 text-left hover:bg-rat-500/10"
    >
      <span className="text-xs font-bold uppercase tracking-wider text-rat-400">
        What’s new · {CURRENT_RELEASE.date}
      </span>
      <span className="mt-2 block font-bold">{CURRENT_RELEASE.title}</span>
      <span className="mt-1 block text-sm text-zinc-400">
        Revisit the guide to setup history, friends, kudos, and trackers →
      </span>
    </button>
  );
}

export function ReleaseGuide() {
  const dialog = useRef<HTMLDialogElement>(null);
  const visit = useRef<Promise<{ show: boolean }> | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let active = true;
    const reopen = () => setOpen(true);
    const claim = () => {
      if (document.visibilityState !== "visible") return;
      visit.current ??= socialRequest<{ show: boolean }>("releases/visit", { method: "POST" });
      visit.current
        .then((result) => {
          if (active && result.show) setOpen(true);
        })
        .catch(() => {});
      document.removeEventListener("visibilitychange", claim);
    };
    window.addEventListener(OPEN_EVENT, reopen);
    document.addEventListener("visibilitychange", claim);
    claim();
    return () => {
      active = false;
      window.removeEventListener(OPEN_EVENT, reopen);
      document.removeEventListener("visibilitychange", claim);
    };
  }, []);
  useEffect(() => {
    if (!open) {
      dialog.current?.close();
      return;
    }
    dialog.current?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);
  function close() {
    setOpen(false);
    void socialRequest("releases/dismiss", { method: "POST", keepalive: true }).catch(() => {});
  }
  return (
    <dialog
      ref={dialog}
      aria-labelledby="release-guide-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-950 p-0 text-zinc-100 shadow-2xl backdrop:bg-black/80"
    >
      <div className="p-5 sm:p-8">
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs font-bold uppercase tracking-wider text-rat-400">
            What’s new · {CURRENT_RELEASE.date}
          </span>
          <button
            type="button"
            onClick={close}
            aria-label="Close update guide"
            className="rounded-lg px-3 py-2 text-zinc-400 hover:bg-zinc-800"
          >
            ✕
          </button>
        </div>
        <h2 id="release-guide-title" className="mt-3 text-3xl font-black leading-tight">
          {CURRENT_RELEASE.title}
        </h2>
        <p className="mt-3 text-sm leading-6 text-zinc-400">
          Keep what you tried. See what your friends are changing. Find your next useful
          instruction.
        </p>
        <div className="mt-5 overflow-hidden rounded-xl border border-zinc-800 text-sm">
          <p className="bg-zinc-900 px-4 py-3 text-xs text-zinc-400">A friend changed AGENTS.md</p>
          <p className="bg-red-500/10 px-4 py-2 font-mono text-red-300">
            <span aria-label="Removed">− </span>Always delegate every task.
          </p>
          <p className="bg-green-500/10 px-4 py-2 font-mono text-green-300">
            <span aria-label="Added">+ </span>Delegate when tasks can run independently.
          </p>
        </div>
        <ol className="mt-5 space-y-4 text-sm leading-6">
          <li>
            <strong className="block">1. Follow the changes</strong>
            <span className="text-zinc-400">
              The feed shows added and removed lines. Give kudos to a change you like. Find people
              in Friends.
            </span>
          </li>
          <li>
            <strong className="block">2. Keep your experiments</strong>
            <span className="text-zinc-400">
              In My setups, save instructions, tools, models, and subscriptions. Compare or restore
              versions, and rate setups you’ve tried—even ones you moved on from. The copyable skill
              lets your agent capture a setup for you.
            </span>
          </li>
          <li>
            <strong className="block">3. Let your trackers do the remembering</strong>
            <span className="text-zinc-400">
              The usage tracker syncs local token counts. Optional AGENTS.md tracking saves future
              edits after you preview and confirm. Enable it in My setups; pause it there anytime.
            </span>
          </li>
        </ol>
        <p className="mt-5 rounded-xl border border-rat-500/30 bg-rat-500/5 p-4 text-xs leading-5 text-zinc-300">
          <strong>Automatic changes are friends only.</strong> Friends are people you follow who
          follow you back, or people on a private board with you. Current and future friends can see
          the shared history. Manual versions can be Only me, Friends, or Public.
        </p>
        <p className="mt-4 text-xs leading-5 text-zinc-500">
          Stats and leaderboards are still here. Reopen this guide anytime in Notifications (Inbox).
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href="/app/setups#automatic"
            className="rounded-lg bg-rat-500 px-5 py-3 text-sm font-bold text-black"
          >
            Set up my trackers →
          </a>
          <button
            type="button"
            onClick={close}
            className="rounded-lg border border-zinc-700 px-5 py-3 text-sm font-semibold"
          >
            Got it
          </button>
        </div>
      </div>
    </dialog>
  );
}
