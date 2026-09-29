import type { SetupVersion } from "@token-rats/contracts";
import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { ApiError } from "../../../../lib/api";
import { socialRequest } from "../../../../lib/social";
export const runtime = "edge";
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let version: SetupVersion;
  try {
    version = (await socialRequest<{ version: SetupVersion }>(`setups/versions/${id}`)).version;
  } catch (e) {
    return new Response("Setup unavailable", {
      status: e instanceof ApiError && e.status === 404 ? 404 : 500,
    });
  }
  if (version.visibility !== "public") return new Response("Not found", { status: 404 });
  const v = version;
  const image = new ImageResponse(
    <div
      style={{
        width: 1200,
        height: 630,
        background: "#09090b",
        color: "#fafafa",
        display: "flex",
        flexDirection: "column",
        padding: "50px 60px",
        fontFamily: "sans-serif",
      }}
    >
      <div
        style={{ display: "flex", justifyContent: "space-between", fontSize: 24, color: "#f97316" }}
      >
        <span>Token Rats</span>
        <span>
          @{v.handle} · v{v.number}
        </span>
      </div>
      <div style={{ display: "flex", fontSize: 52, fontWeight: 800, marginTop: 36 }}>
        {v.name.slice(0, 65)}
      </div>
      <div style={{ display: "flex", fontSize: 22, color: "#a1a1aa", marginTop: 16 }}>
        {(v.note || v.bundle.workflow || "My agent setup, saved for the next experiment.").slice(
          0,
          170,
        )}
      </div>
      <div
        style={{
          display: "flex",
          background: "#18181b",
          borderLeft: "4px solid #f97316",
          padding: 24,
          marginTop: 26,
          fontSize: 19,
          color: "#d4d4d8",
          whiteSpace: "pre-wrap",
        }}
      >
        {(
          v.bundle.files[0]?.content ||
          v.bundle.tools ||
          "Explore the tools and instructions behind this setup."
        ).slice(0, 260)}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: "auto",
          fontSize: 18,
          color: "#a1a1aa",
        }}
      >
        <span>{(v.bundle.tools || v.bundle.models).slice(0, 75)}</span>
        <span>tokenrats.com · Try it. Rate it. Make it yours.</span>
      </div>
    </div>,
    { width: 1200, height: 630 },
  );
  image.headers.set("Cache-Control", "no-store");
  if (req.nextUrl.searchParams.has("download"))
    image.headers.set("Content-Disposition", 'attachment; filename="token-rats-setup.png"');
  return image;
}
