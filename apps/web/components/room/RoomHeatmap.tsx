/**
 * RoomHeatmap — v1.2 Track Y. Thin client wrapper that fetches the room-scope
 * heatmap from /v1/heatmap?scope=room&id=:code and supports the 60d ⇄ 52w
 * toggle. Same UX as ProfileHeatmap but pulls a different endpoint.
 */
"use client";

import type { HeatmapResponse } from "@token-rats/contracts";
import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { Heatmap } from "../Heatmap";

export interface RoomHeatmapProps {
  code: string;
}

export function RoomHeatmap({ code }: RoomHeatmapProps) {
  const [response, setResponse] = useState<HeatmapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [cache60, setCache60] = useState<HeatmapResponse | null>(null);
  const [cache364, setCache364] = useState<HeatmapResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .getRoomHeatmap(code, 60)
      .then((data) => {
        if (cancelled) return;
        setResponse(data);
        setCache60(data);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  async function switchRange(days: 60 | 364) {
    if (!response) return;
    if (days === response.rangeDays) return;
    if (days === 60 && cache60) {
      setResponse(cache60);
      return;
    }
    if (days === 364 && cache364) {
      setResponse(cache364);
      return;
    }
    setLoading(true);
    try {
      const data = await api.getRoomHeatmap(code, days);
      if (days === 60) setCache60(data);
      else setCache364(data);
      setResponse(data);
    } catch {
      // keep current view
    } finally {
      setLoading(false);
    }
  }

  if (error) return null;
  if (!response) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <p className="text-sm text-zinc-500">Loading activity…</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <RangeToggle current={response.rangeDays} onSwitch={switchRange} loading={loading} />
      </div>
      <Heatmap
        cells={response.cells}
        from={response.from}
        to={response.to}
        rangeDays={response.rangeDays}
      />
    </div>
  );
}

function RangeToggle({
  current,
  onSwitch,
  loading,
}: {
  current: 60 | 364;
  onSwitch: (days: 60 | 364) => void;
  loading: boolean;
}) {
  return (
    <div className="flex gap-1 rounded-xl border border-zinc-800 bg-zinc-900 p-1">
      {[
        { days: 60 as const, label: "60d" },
        { days: 364 as const, label: "52w" },
      ].map((opt) => (
        <button
          key={opt.days}
          type="button"
          onClick={() => onSwitch(opt.days)}
          disabled={loading}
          className={[
            "rounded-lg px-3 py-1 text-xs font-semibold transition-colors",
            opt.days === current
              ? "bg-zinc-700 text-white shadow"
              : "text-zinc-400 hover:text-zinc-200",
            loading ? "opacity-60 cursor-wait" : "",
          ].join(" ")}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
