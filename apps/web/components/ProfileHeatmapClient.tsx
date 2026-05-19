"use client";

/**
 * Client wrapper around <HeatmapWithToggle> that fetches per-user heatmap
 * data when the range changes. Server renders the initial heatmap.
 */

import type { Heatmap, HeatmapRange } from "@token-rats/contracts";
import { api } from "../lib/api";
import { HeatmapWithToggle } from "./HeatmapWithToggle";

interface Props {
  handle: string;
  initial: Heatmap;
}

export function ProfileHeatmapClient({ handle, initial }: Props) {
  async function fetcher(range: HeatmapRange) {
    const res = await api.getHeatmap(handle, range);
    return res.heatmap;
  }
  return <HeatmapWithToggle initial={initial} fetcher={fetcher} />;
}
