"use client";

import {
  type Heatmap as HeatmapData,
  type HeatmapRange,
  activityGrowthLabel,
} from "@token-rats/contracts";
import { useRef, useState } from "react";
import { Heatmap } from "./Heatmap";
import { ProfileShareButton } from "./ProfileShareButton";

interface Props {
  initial: HeatmapData;
  fetcher: (range: HeatmapRange) => Promise<HeatmapData>;
  title?: string;
  handle?: string;
  publicProfile?: boolean;
}

export function HeatmapWithToggle({
  initial,
  fetcher,
  title = "AI activity",
  handle,
  publicProfile,
}: Props) {
  const [heatmap, setHeatmap] = useState(initial);
  const [pending, setPending] = useState<HeatmapRange | null>(null);
  const [error, setError] = useState("");
  const requestId = useRef(0);
  const range = heatmap.range;

  async function swap(next: HeatmapRange) {
    if (next === range && !pending) return;
    const id = ++requestId.current;
    setPending(next);
    setError("");
    try {
      const data = await fetcher(next);
      if (id !== requestId.current) return;
      setHeatmap(data);
      const url = new URL(window.location.href);
      url.searchParams.set("range", next);
      window.history.replaceState(null, "", url.toString());
    } catch {
      if (id === requestId.current) setError("Could not load this window. Please try again.");
    } finally {
      if (id === requestId.current) setPending(null);
    }
  }

  return (
    <section
      id="activity"
      aria-label={title}
      className="scroll-mt-6 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6"
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="mt-1 text-xs text-zinc-500">
            {range === "4w" ? "Your recent momentum" : "A quarter of building with AI"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="inline-flex rounded-lg border border-zinc-800 bg-zinc-900 p-1"
            aria-label="Activity window"
          >
            {(["4w", "12w"] as const).map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={(pending ?? range) === r}
                onClick={() => void swap(r)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${r === (pending ?? range) ? "bg-zinc-700 text-white shadow" : "text-zinc-400 hover:text-zinc-200"}`}
              >
                {r === "4w" ? "4 weeks" : "12 weeks"}
              </button>
            ))}
          </div>
          {handle && (
            <ProfileShareButton
              handle={handle}
              activityRange={range}
              label="Share progress"
              publicProfile={publicProfile}
              compact
              shareText={`${heatmap.summary.activeDays} active days in the last ${range === "12w" ? 12 : 4} weeks. ${heatmap.summary.changePercent === null ? activityGrowthLabel(heatmap) : `AI usage ${activityGrowthLabel(heatmap)} versus the previous ${range === "12w" ? 12 : 4} weeks.`}`}
            />
          )}
        </div>
      </div>
      <div
        aria-busy={pending !== null}
        className={`transition-opacity ${pending ? "opacity-40" : "opacity-100"}`}
      >
        <Heatmap heatmap={heatmap} />
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-orange-300">
          {error}
        </p>
      )}
      <p className="mt-5 border-t border-zinc-800 pt-3 text-[11px] text-zinc-500">
        Today outlined · Faint squares outside window · UTC · 12-week color scale
      </p>
    </section>
  );
}
