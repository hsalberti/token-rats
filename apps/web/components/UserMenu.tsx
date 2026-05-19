"use client";

/**
 * Avatar + dropdown menu used in the dashboard header.
 *
 * "Sign out" is a plain `<form method="POST">` so it works without JS — the
 * API responds 303 → `/`, the browser navigates, and the session cookie is
 * gone. Menu open/close needs JS; the actions inside do not.
 */

import type { User } from "@token-rats/contracts";
import { useEffect, useRef, useState } from "react";
import { AUTH_LOGOUT } from "../lib/api";
import { Avatar } from "./ui/Avatar";

interface Props {
  user: User;
}

export function UserMenu({ user }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    function onDocClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-3 rounded-lg px-1 py-1 transition-colors hover:bg-zinc-800/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-rat-500"
      >
        <Avatar src={user.avatarUrl} handle={user.handle} size="sm" />
        <span className="hidden text-sm font-semibold sm:block">@{user.handle}</span>
        <svg
          className={`h-4 w-4 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 shadow-xl shadow-black/40"
        >
          <div className="border-b border-zinc-800 px-4 py-3">
            <p className="text-xs uppercase tracking-widest text-zinc-500">Signed in as</p>
            <p className="mt-0.5 truncate text-sm font-semibold">@{user.handle}</p>
          </div>

          <a
            href={`/u/${user.handle}`}
            role="menuitem"
            className="block px-4 py-2.5 text-sm text-zinc-200 hover:bg-zinc-800"
          >
            View public profile
          </a>
          <a
            href="/app/friends"
            role="menuitem"
            className="block px-4 py-2.5 text-sm text-zinc-200 hover:bg-zinc-800"
          >
            Friends
          </a>
          <a
            href="/onboarding"
            role="menuitem"
            className="block px-4 py-2.5 text-sm text-zinc-200 hover:bg-zinc-800"
          >
            Token autobiography
          </a>
          <a
            href="/settings"
            role="menuitem"
            className="block px-4 py-2.5 text-sm text-zinc-200 hover:bg-zinc-800"
          >
            Settings
          </a>
          <a
            href="https://x.com/tokenratsx"
            target="_blank"
            rel="noopener noreferrer"
            role="menuitem"
            className="block px-4 py-2.5 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-rat-400"
          >
            Help · DM @tokenratsx
          </a>

          <form action={AUTH_LOGOUT} method="POST" className="border-t border-zinc-800">
            <button
              type="submit"
              role="menuitem"
              className="block w-full px-4 py-2.5 text-left text-sm text-rat-400 hover:bg-zinc-800"
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
