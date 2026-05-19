"use client";

/**
 * HeatmapWithToggle — wraps <Heatmap> with a 30d/52w button group that swaps
 * the data live and keeps `?range=` in sync via shallow nav. Default range
 * is 30d everywhere; the bare URL (no `?range=`) renders as 30d.
 *
 * The `fetcher` is passed in so the same wrapper handles user and room
 * heatmaps without duplicating contract knowledge here.
 */

import type { Heatmap as HeatmapData, HeatmapRange } from "@token-rats/contracts";
import { useEffect, useState } from "react";
import { Heatmap } from "./Heatmap";

interface Props {
  initial: HeatmapData;
  fetcher: (range: HeatmapRange) => Promise<HeatmapData>;
  title?: string;
}

const RANGES: HeatmapRange[] = ["30d", "52w"];
const RANGE_LABELS: Record<HeatmapRange, string> = {
  "30d": "30 days",
  "52w": "52 weeks",
};

export function HeatmapWithToggle({ initial, fetcher, title }: Props) {
  const [range, setRange] = useState<HeatmapRange>(initial.range);
  const [heatmap, setHeatmap] = useState<HeatmapData>(initial);
  const [loading, setLoading] = useState(false);

  // Hydrate from `?range=` on mount so a deep-link to ?range=52w renders
  // correctly even though SSR rendered the default 30d. Mount-only by
  // design — `range` itself is owned by this component so closing over its
  // initial value here is correct.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only hydration.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("range");
    if (fromUrl === "52w" && range !== "52w") {
      void swap("52w", { pushUrl: false });
    }
  }, []);

  async function swap(next: HeatmapRange, opts: { pushUrl?: boolean } = { pushUrl: true }) {
    if (next === range) return;
    setRange(next);
    setLoading(true);

    if (opts.pushUrl !== false && typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (next === "30d") {
        url.searchParams.delete("range");
      } else {
        url.searchParams.set("range", next);
      }
      window.history.replaceState(null, "", url.toString());
    }

    try {
      const next$ = await fetcher(next);
      setHeatmap(next$);
    } catch {
      // keep existing data on error — re-flipping the toggle retries.
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-xl border border-zinc-800 bg-zinc-900 p-1 w-fit">
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => void swap(r)}
            className={[
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
              r === range ? "bg-zinc-700 text-white shadow" : "text-zinc-400 hover:text-zinc-200",
            ].join(" ")}
          >
            {RANGE_LABELS[r]}
          </button>
        ))}
      </div>
      <div className={`transition-opacity duration-150 ${loading ? "opacity-40" : "opacity-100"}`}>
        <Heatmap heatmap={heatmap} range={range} title={title} />
      </div>
    </div>
  );
}
