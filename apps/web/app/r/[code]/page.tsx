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
  const roomCode = code as Parameters<typeof api.getRoom>[0];

  // Not signed in — bounce to GitHub via /join, which preserves the auto-join intent.
  if (!session) {
    redirect(`/join/${code}`);
  }

  async function loadRoom() {
    return Promise.all([
      api.getRoom(roomCode, cookieHeader),
      api.getLeaderboard(roomCode, "today", cookieHeader),
    ]);
  }

  try {
    let [roomData, leaderboardData] = await loadRoom();
    return (
      <RoomView
        room={roomData.room}
        members={roomData.members}
        initialLeaderboard={leaderboardData.leaderboard}
        cookieHeader={cookieHeader}
        currentUserId={session.id}
      />
    );
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 404) notFound();
      if (err.status === 401) {
        redirect(`/join/${code}`);
      }
      if (err.status === 403) {
        // Signed-in non-member — auto-join, then re-render.
        try {
          await api.joinRoom(roomCode, cookieHeader);
        } catch (joinErr) {
          if (joinErr instanceof ApiError && joinErr.status === 404) notFound();
          throw joinErr;
        }
        const [roomData, leaderboardData] = await loadRoom();
        return (
          <RoomView
            room={roomData.room}
            members={roomData.members}
            initialLeaderboard={leaderboardData.leaderboard}
            cookieHeader={cookieHeader}
            currentUserId={session.id}
          />
        );
      }
    }
    throw err;
  }
}
