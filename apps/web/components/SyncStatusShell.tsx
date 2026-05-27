"use client";

/**
 * Client wrapper for the authed top bar. Fetches device status + latest CLI
 * version once on mount, then renders:
 *
 *   1. UpdateBanner — full-width strip above the header when at least one
 *      device is on a CLI older than `latest`. Dismissible per-version.
 *   2. SyncChip — small pill rendered next to the user menu, summarizing
 *      the **worst** state across all non-revoked devices.
 *
 * Aggregation rules — when one machine is autosyncing and another is not, we
 * surface the worst-of state so the user is nudged to fix the lagging install:
 *   • all live, ≥1 device          → green  "Synced 2m ago · 2/2 live"
 *   • daemon stale OR upload stale → amber  "Last synced 47m ago · 1/2 live"
 *   • no daemon ever               → grey   "Manual · last synced 3h ago"
 *   • no devices ever              → hidden
 */

import type { GetMeDevicesResponse } from "@token-rats/contracts";
import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";

interface Status {
  loading: boolean;
  latest: string | null;
  outdated: boolean;
  /** ms since most recent session upload across all non-revoked devices */
  lastSyncedAt: number | null;
  liveCount: number;
  activeCount: number;
  /** "synced" | "stale" | "manual" | "empty" */
  state: "synced" | "stale" | "manual" | "empty";
  upgradeCommand: string;
}

/** Lex-style semver compare. Enough for "0.1.0" < "0.2.0" cases. */
function isOlder(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const pa = a.split(".").map((x) => Number.parseInt(x, 10) || 0);
  const pb = b.split(".").map((x) => Number.parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const va = pa[i] ?? 0;
    const vb = pb[i] ?? 0;
    if (va < vb) return true;
    if (va > vb) return false;
  }
  return false;
}

function useSyncStatus(): Status {
  const [devicesRes, setDevicesRes] = useState<GetMeDevicesResponse | null>(null);
  const [latest, setLatest] = useState<string | null>(null);
  const [upgradeCommand, setUpgradeCommand] = useState<string>("npm i -g token-rats@latest");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.getMeDevices().catch(() => null), api.getCliVersion().catch(() => null)])
      .then(([dev, ver]) => {
        if (cancelled) return;
        setDevicesRes(dev);
        if (ver) {
          setLatest(ver.latest);
          setUpgradeCommand(ver.upgradeCommand);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(() => {
    const devices = (devicesRes?.devices ?? []).filter(
      (d) => d.revokedAt === null && d.deviceId !== "legacy",
    );
    const activeCount = devices.length;
    const liveCount = devices.filter((d) => d.isLive).length;
    const lastSyncedAt = devices.reduce<number | null>(
      (acc, d) => (acc === null || d.lastSeenAt > acc ? d.lastSeenAt : acc),
      null,
    );
    const anyDaemonEverSeen = devices.some((d) => d.lastHeartbeatAt !== null);
    const anyOutdated = devices.some((d) => isOlder(d.cliVersion, latest));

    let state: Status["state"];
    if (activeCount === 0) state = "empty";
    else if (liveCount === activeCount) state = "synced";
    else if (anyDaemonEverSeen) state = "stale";
    else state = "manual";

    return {
      loading,
      latest,
      outdated: anyOutdated,
      lastSyncedAt,
      liveCount,
      activeCount,
      state,
      upgradeCommand,
    };
  }, [devicesRes, latest, loading, upgradeCommand]);
}

function relativeFrom(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

const DISMISS_KEY = "tr.cliBannerDismissed";

export function SyncStatusShell({ userMenuSlot }: { userMenuSlot: React.ReactNode }) {
  const status = useSyncStatus();
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      setDismissedVersion(localStorage.getItem(DISMISS_KEY));
    } catch {
      // ignore
    }
  }, []);

  const showBanner =
    status.outdated && status.latest !== null && status.latest !== dismissedVersion;

  function dismissBanner() {
    if (!status.latest) return;
    try {
      localStorage.setItem(DISMISS_KEY, status.latest);
    } catch {
      // ignore
    }
    setDismissedVersion(status.latest);
  }

  async function copyUpgrade() {
    try {
      await navigator.clipboard.writeText(status.upgradeCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // ignore
    }
  }

  return (
    <>
      {showBanner && (
        <div className="relative w-full border-b border-rat-700/50 bg-gradient-to-r from-rat-600/20 via-rat-500/10 to-transparent">
          <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2 text-sm">
            <span className="hidden sm:inline-block rounded-full bg-rat-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rat-300">
              Update
            </span>
            <span className="text-zinc-200">Autosync improvements in v{status.latest}.</span>
            <button
              type="button"
              onClick={copyUpgrade}
              className="group ml-1 inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900/80 px-2 py-1 font-mono text-xs text-rat-300 hover:border-rat-500 hover:text-rat-200"
              title="Click to copy"
            >
              <code>{status.upgradeCommand}</code>
              <span className="text-zinc-500 group-hover:text-rat-400">
                {copied ? "copied ✓" : "copy"}
              </span>
            </button>
            <button
              type="button"
              onClick={dismissBanner}
              aria-label="Dismiss until next version"
              className="ml-auto rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            >
              ✕
            </button>
          </div>
        </div>
      )}
      <header className="relative z-40 border-b border-zinc-800 bg-zinc-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-6 py-4">
          <a href="/app" className="inline-flex shrink-0 items-center">
            {/* The wordmark slot is rendered server-side by AuthedTopBar; we use
                a simple anchor here to avoid two JS components for one logo. */}
            <span aria-label="Token Rats" className="inline-flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand/rat-mark.png"
                alt=""
                aria-hidden="true"
                className="h-7 w-7 select-none"
              />
              <span className="font-black tracking-tight leading-none text-xl">
                Token <span className="text-rat-500">Rats</span>
              </span>
            </span>
          </a>
          <div className="flex items-center gap-3">
            <SyncChip status={status} />
            {userMenuSlot}
          </div>
        </div>
      </header>
    </>
  );
}

function SyncChip({ status }: { status: Status }) {
  if (status.loading || status.state === "empty") return null;

  const fresh = status.lastSyncedAt ? relativeFrom(status.lastSyncedAt) : "never";
  const machines =
    status.activeCount > 1 ? ` · ${status.liveCount}/${status.activeCount} live` : "";

  if (status.state === "synced") {
    return (
      <a
        href="/app/devices"
        className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-emerald-700/40 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-300 hover:border-emerald-500/70"
        title="Background daemon active"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
        Synced {fresh}
        {machines}
      </a>
    );
  }

  if (status.state === "stale") {
    return (
      <a
        href="/app/devices"
        className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-amber-700/40 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-300 hover:border-amber-500/70"
        title="Daemon hasn't checked in recently — open Devices"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
        Last synced {fresh}
        {machines}
      </a>
    );
  }

  // manual
  return (
    <a
      href="/cli"
      className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-800/60 px-2.5 py-1 text-xs font-semibold text-zinc-300 hover:border-rat-500/70 hover:text-rat-200"
      title="No autosync daemon detected — install it from the CLI page"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" />
      Manual · {fresh} · Enable autosync →
    </a>
  );
}
