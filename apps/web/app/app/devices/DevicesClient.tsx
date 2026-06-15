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

function fmtAbsolute(tsMs: number | null): string {
  if (!tsMs || tsMs <= 0) return "Never";
  return new Date(tsMs).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function shortId(id: string): string {
  if (id === "legacy") return "legacy";
  return id.length > 12 ? id.slice(0, 8) : id;
}

function labelForProvider(value: string): string {
  switch (value) {
    case "anthropic":
      return "Anthropic";
    case "openai":
      return "OpenAI";
    case "cursor":
      return "Cursor";
    case "unknown":
      return "Unknown";
    default:
      return value;
  }
}

function labelForSource(value: string): string {
  switch (value) {
    case "claude-code":
      return "Claude Code";
    case "codex":
      return "Codex";
    case "cursor":
      return "Cursor";
    default:
      return value;
  }
}

function labelForClient(value: string): string {
  switch (value) {
    case "claude-code":
      return "Claude Code";
    case "codex-cli":
      return "Codex CLI";
    case "cursor":
      return "Cursor";
    case "token-rats-proxy":
      return "Token Rats Proxy";
    case "unknown":
      return "Unknown";
    default:
      return value;
  }
}

function labelForChannel(value: string): string {
  switch (value) {
    case "cli":
      return "CLI";
    case "ide":
      return "IDE";
    case "api":
      return "API";
    case "proxy":
      return "Proxy";
    case "local":
      return "Local";
    case "unknown":
      return "Unknown";
    default:
      return value;
  }
}

function joinBreakdown(
  items: { value: string }[],
  formatter: (value: string) => string = (value) => value,
): string {
  if (items.length === 0) return "None yet";
  return items.map((item) => formatter(item.value)).join(", ");
}

function deviceSortKey(device: Device): number {
  if (device.isLegacy) return 4;
  if (device.revokedAt !== null) return 3;
  if (device.isLive) return 0;
  return 1;
}

export function DevicesClient({ initial }: Props) {
  const [devices, setDevices] = useState<Device[]>(initial);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const now = Date.now();

  const orderedDevices = [...devices].sort((a, b) => {
    const groupDiff = deviceSortKey(a) - deviceSortKey(b);
    if (groupDiff !== 0) return groupDiff;
    return (b.lastSessionAt ?? b.lastSeenAt ?? 0) - (a.lastSessionAt ?? a.lastSeenAt ?? 0);
  });

  const activeDevices = devices.filter((d) => !d.isLegacy && d.revokedAt === null);
  const liveDevices = activeDevices.filter((d) => d.isLive);
  const legacyDevice = devices.find((d) => d.isLegacy);
  const latestSyncAt = devices.reduce<number | null>(
    (latest, device) =>
      latest === null || (device.lastSessionAt ?? 0) > latest
        ? (device.lastSessionAt ?? latest)
        : latest,
    null,
  );
  const total30d = devices.reduce(
    (acc, device) => ({
      tokens: acc.tokens + device.totals.tokens,
      costUsdCents: acc.costUsdCents + device.totals.costUsdCents,
      sessions: acc.sessions + device.totals.sessions,
    }),
    { tokens: 0, costUsdCents: 0, sessions: 0 },
  );

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
      <div className="grid gap-3 md:grid-cols-4">
        <SummaryStat label="Active devices" value={`${activeDevices.length}`} />
        <SummaryStat label="Live now" value={`${liveDevices.length}`} />
        <SummaryStat label="30d volume" value={`${fmtTokens(total30d.tokens)} tokens`} />
        <SummaryStat
          label="Latest sync"
          value={latestSyncAt ? fmtRelative(latestSyncAt, now) : "No uploads yet"}
        />
      </div>

      {legacyDevice && (
        <Card>
          <div className="space-y-2 p-4">
            <div className="text-sm font-semibold text-amber-300">
              Legacy sessions need reconnecting
            </div>
            <p className="text-sm text-zinc-400">
              Some of your history predates per-device ids, so Token Rats can preserve those uploads
              but cannot split them back into the original machines. Re-running{" "}
              <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-300">
                token-rats login
              </code>{" "}
              on each current computer will register fresh device ids for all future uploads.
            </p>
            <p className="text-xs text-zinc-500">
              Legacy bucket: {fmtTokens(legacyDevice.totalsAllTime.tokens)} tokens all-time, last
              activity {fmtAbsolute(legacyDevice.lastSessionAt)}
            </p>
          </div>
        </Card>
      )}

      {error && (
        <div className="rounded border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {orderedDevices.map((d) => {
        const isRevoked = d.revokedAt !== null;
        const isLegacy = d.isLegacy || d.deviceId === "legacy";

        return (
          <Card key={d.deviceId}>
            <div className="flex flex-col gap-5 p-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3">
                  {isLegacy ? (
                    <span
                      className="inline-block h-2 w-2 rounded-full bg-zinc-600"
                      title="Legacy"
                    />
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
                        "Sessions uploaded before device registration existed, so they remain preserved but not attributable to a single machine."
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
                    <div className="mt-1 text-[11px] text-zinc-600">
                      All-time: {fmtTokens(d.totalsAllTime.tokens)} ·{" "}
                      {fmtCost(d.totalsAllTime.costUsdCents)}
                    </div>
                  </div>
                  {!isLegacy && !isRevoked && (
                    <Button
                      variant="ghost"
                      onClick={() => handleRevoke(d.deviceId)}
                      disabled={pending === d.deviceId}
                    >
                      {pending === d.deviceId ? "Disconnecting..." : "Disconnect"}
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-3">
                <InfoLine label="Latest upload" value={fmtAbsolute(d.lastSessionAt)} />
                <InfoLine
                  label="Registered"
                  value={isLegacy ? "Pre-device-id" : fmtAbsolute(d.createdAt)}
                />
                <InfoLine
                  label="Top sources (30d)"
                  value={joinBreakdown(d.topSources, labelForSource)}
                />
                <InfoLine
                  label="Top clients (30d)"
                  value={joinBreakdown(d.topClients, labelForClient)}
                />
                <InfoLine
                  label="Top channels (30d)"
                  value={joinBreakdown(d.topChannels, labelForChannel)}
                />
                <InfoLine
                  label="Top providers (30d)"
                  value={joinBreakdown(d.topProviders, labelForProvider)}
                />
                <InfoLine label="Top models (30d)" value={joinBreakdown(d.topModels)} />
                <InfoLine
                  label="Uploads accepted"
                  value={isLegacy ? "Historical only" : `${d.lastUploadCount} batch uploads`}
                />
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <div className="p-4">
        <div className="text-xs uppercase tracking-[0.16em] text-zinc-500">{label}</div>
        <div className="mt-2 text-lg font-semibold text-zinc-100">{value}</div>
      </div>
    </Card>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-600">{label}</div>
      <div className="mt-1 text-sm text-zinc-300">{value}</div>
    </div>
  );
}
