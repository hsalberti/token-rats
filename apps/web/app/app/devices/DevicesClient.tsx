"use client";

import type { Device } from "@token-rats/contracts";
import { useState } from "react";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { ApiError, api } from "../../../lib/api";

interface Props {
  initial: Device[];
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return `${n}`;
}

function fmtCost(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtRelative(tsMs: number, now: number): string {
  if (tsMs <= 0) return "never";
  const diff = now - tsMs;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} h ago`;
  return `${Math.floor(diff / 86_400_000)} d ago`;
}

function shortId(id: string): string {
  if (id === "legacy") return "legacy";
  return id.length > 12 ? id.slice(0, 8) : id;
}

export function DevicesClient({ initial }: Props) {
  const [devices, setDevices] = useState<Device[]>(initial);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const now = Date.now();

  async function handleRevoke(deviceId: string) {
    if (deviceId === "legacy") return;
    if (
      !confirm("Disconnect this device? Its next upload will be refused and the daemon will exit.")
    ) {
      return;
    }
    setPending(deviceId);
    setError(null);
    try {
      const res = await api.revokeDevice(deviceId);
      setDevices((prev) =>
        prev.map((d) =>
          d.deviceId === deviceId ? { ...d, revokedAt: res.revokedAt, isLive: false } : d,
        ),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to disconnect device.");
    } finally {
      setPending(null);
    }
  }

  if (devices.length === 0) {
    return (
      <Card>
        <div className="p-6 text-sm text-zinc-500">
          No devices yet. Install the CLI on a computer and run{" "}
          <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-300">
            npx token-rats login
          </code>{" "}
          to register your first device.
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}
      {devices.map((d) => {
        const isRevoked = d.revokedAt !== null;
        const isLegacy = d.deviceId === "legacy";
        return (
          <Card key={d.deviceId}>
            <div className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-3">
                {isLegacy ? (
                  <span className="inline-block h-2 w-2 rounded-full bg-zinc-600" title="Legacy" />
                ) : isRevoked ? (
                  <span
                    className="inline-block h-2 w-2 rounded-full bg-zinc-700"
                    title="Disconnected"
                  />
                ) : d.isLive ? (
                  <span
                    className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-400"
                    title="Currently uploading"
                  />
                ) : (
                  <span className="inline-block h-2 w-2 rounded-full bg-zinc-500" title="Idle" />
                )}
                <div>
                  <div className="font-medium text-zinc-100">
                    {isLegacy
                      ? "Legacy sessions (pre-device-id)"
                      : `Device · ${shortId(d.deviceId)}`}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {isLegacy ? (
                      "Sessions uploaded before this device was named — preserved but no longer mutable."
                    ) : (
                      <>
                        {d.cliVersion && <span>CLI {d.cliVersion} · </span>}
                        <span>Last seen {fmtRelative(d.lastSeenAt, now)}</span>
                        {d.lastHeartbeatAt && (
                          <span> · Heartbeat {fmtRelative(d.lastHeartbeatAt, now)}</span>
                        )}
                        {isRevoked && (
                          <span className="ml-2 text-amber-400">
                            Disconnected {fmtRelative(d.revokedAt ?? 0, now)}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <div className="text-sm font-medium text-zinc-100">
                    {fmtTokens(d.totals.tokens)} tokens
                  </div>
                  <div className="text-xs text-zinc-500">
                    {fmtCost(d.totals.costUsdCents)} · {d.totals.sessions} sessions (30d)
                  </div>
                </div>
                {!isLegacy && !isRevoked && (
                  <Button
                    variant="ghost"
                    onClick={() => handleRevoke(d.deviceId)}
                    disabled={pending === d.deviceId}
                  >
                    {pending === d.deviceId ? "Disconnecting…" : "Disconnect"}
                  </Button>
                )}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
