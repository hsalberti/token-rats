import type { GroupStreak, Heatmap, HeatmapRange, RoomSummary } from "@token-rats/contracts";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ApiError, api } from "../../../lib/api";
import { getCookieHeader, getSession } from "../../../lib/auth";
import { RoomPublicView } from "./RoomPublicView";
import { RoomView } from "./RoomView";

export const runtime = "edge";

interface Props {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ range?: string | string[] }>;
}

function pickRange(raw: string | string[] | undefined): HeatmapRange {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === "52w" ? "52w" : "30d";
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const cardUrl = `/cards/room/${code}`;
  return {
    title: `Room ${code}`,
    openGraph: {
      images: [{ url: cardUrl, width: 1200, height: 630, alt: `Token Rats — Room ${code}` }],
    },
    twitter: {
      card: "summary_large_image",
      images: [cardUrl],
    },
  };
}

export default async function RoomPage({ params, searchParams }: Props) {
  const { code } = await params;
  const range = pickRange((await searchParams).range);
  const [cookieHeader, session] = await Promise.all([getCookieHeader(), getSession()]);
  const roomCode = code as Parameters<typeof api.getRoom>[0];

  // The summary is public — every viewer (signed in or out) sees it.
  // A 404 here means the room doesn't exist; anything else (5xx) bubbles up.
  let summary: RoomSummary;
  try {
    const res = await api.getRoomSummary(roomCode, cookieHeader);
    summary = res.summary;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  // Signed-out viewers see the read-only public view (stat strip + sign-in CTA).
  if (!session) {
    return <RoomPublicView summary={summary} signedIn={false} />;
  }

  async function loadFullRoom(): Promise<{
    room: Awaited<ReturnType<typeof api.getRoom>>["room"];
    members: Awaited<ReturnType<typeof api.getRoom>>["members"];
    leaderboard: Awaited<ReturnType<typeof api.getLeaderboard>>["leaderboard"];
    heatmap: Heatmap | null;
    groupStreak: GroupStreak | null;
  }> {
    const [roomData, leaderboardData, heatmapRes, streakRes] = await Promise.all([
      api.getRoom(roomCode, cookieHeader),
      api.getLeaderboard(roomCode, "30d", cookieHeader),
      api.getRoomHeatmap(roomCode, range, cookieHeader).catch(() => null),
      api.getRoomGroupStreak(roomCode, cookieHeader).catch(() => null),
    ]);
    return {
      room: roomData.room,
      members: roomData.members,
      leaderboard: leaderboardData.leaderboard,
      heatmap: heatmapRes?.heatmap ?? null,
      groupStreak: streakRes?.groupStreak ?? null,
    };
  }

  try {
    const data = await loadFullRoom();
    return (
      <RoomView
        summary={summary}
        room={data.room}
        members={data.members}
        initialLeaderboard={data.leaderboard}
        heatmap={data.heatmap}
        groupStreak={data.groupStreak}
        cookieHeader={cookieHeader}
        currentUserId={session.id}
      />
    );
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 404) notFound();
      if (err.status === 401) redirect(`/join/${code}`);
      if (err.status === 403) {
        // Signed-in non-member on a private room — auto-join (current
        // behavior). If join itself 403s (feature #6 country mismatch),
        // fall through to the read-only public view.
        try {
          await api.joinRoom(roomCode, cookieHeader);
          const data = await loadFullRoom();
          return (
            <RoomView
              summary={summary}
              room={data.room}
              members={data.members}
              initialLeaderboard={data.leaderboard}
              heatmap={data.heatmap}
              groupStreak={data.groupStreak}
              cookieHeader={cookieHeader}
              currentUserId={session.id}
            />
          );
        } catch (joinErr) {
          if (joinErr instanceof ApiError && joinErr.status === 404) notFound();
          return <RoomPublicView summary={summary} signedIn={true} />;
        }
      }
    }
    throw err;
  }
}
