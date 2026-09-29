import { type ProfileShare, ProfileShareQuery, profileShareSearch } from "@token-rats/contracts";
import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { ProfileShareImage } from "../../../../components/ProfileShareImage";
import { ApiError } from "../../../../lib/api";
import { socialRequest } from "../../../../lib/social";

export const runtime = "edge";

export async function GET(req: NextRequest, { params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const query = ProfileShareQuery.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!query.success) return new Response("Invalid line selection", { status: 400 });
  let share: ProfileShare;
  try {
    ({ share } = await socialRequest<{ share: ProfileShare }>(
      `u/${encodeURIComponent(handle)}/share${profileShareSearch(query.data)}`,
    ));
  } catch (err) {
    return new Response("Profile card unavailable", {
      status: err instanceof ApiError && [400, 404].includes(err.status) ? err.status : 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
  const image = new ImageResponse(
    <ProfileShareImage share={share} logoUrl={new URL("/brand/rat-mark.png", req.url).href} />,
    { width: 1200, height: 630 },
  );
  // Profile and version visibility can change immediately after sharing.
  image.headers.set("Cache-Control", "no-store");
  if (req.nextUrl.searchParams.has("download"))
    image.headers.set(
      "Content-Disposition",
      `attachment; filename="token-rats-${share.handle.replace(/[^a-zA-Z0-9-]/g, "")}.png"`,
    );
  return image;
}
