import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCookieHeader, getSession } from "../../../lib/auth";
import { api, ApiError } from "../../../lib/api";
import { RoomView } from "./RoomView";

export const runtime = "edge";

interface Props {
  params: Promise<{ code: string }>;
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

export default async function RoomPage({ params }: Props) {
  const { code } = await params;
  const [cookieHeader, session] = await Promise.all([getCookieHeader(), getSession()]);

  try {
    const [roomData, leaderboardData] = await Promise.all([
      api.getRoom(code as Parameters<typeof api.getRoom>[0], cookieHeader),
      api.getLeaderboard(code as Parameters<typeof api.getLeaderboard>[0], "today", cookieHeader),
    ]);

    return (
      <RoomView
        room={roomData.room}
        members={roomData.members}
        initialLeaderboard={leaderboardData.leaderboard}
        cookieHeader={cookieHeader}
        currentUserId={session?.id}
      />
    );
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 404) notFound();
      if (err.status === 401 || err.status === 403) {
        redirect(`/signin?next=${encodeURIComponent(`/r/${code}`)}`);
      }
    }
    throw err;
  }
}
