import { GetHeatmapQuery, type Heatmap } from "@token-rats/contracts";
import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { ActivityShareImage } from "../../../../../components/ActivityShareImage";
import { ApiError, api } from "../../../../../lib/api";

export const runtime = "edge";

export async function GET(req: NextRequest, { params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const query = GetHeatmapQuery.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!query.success) return new Response("Invalid activity window", { status: 400 });
  let heatmap: Heatmap;
  try {
    // Public reads only: a card must be accessible to people receiving it.
    ({ heatmap } = await api.getHeatmap(handle, query.data.range));
  } catch (err) {
    return new Response("Activity card unavailable", {
      status: err instanceof ApiError && err.status === 404 ? 404 : 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
  const image = new ImageResponse(<ActivityShareImage handle={handle} heatmap={heatmap} />, {
    width: 1200,
    height: 630,
  });
  image.headers.set("Cache-Control", "no-store");
  return image;
}
