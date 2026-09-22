import { getSession } from "@/lib/auth";
import { ThreadClient } from "./Client";
export const runtime = "edge";
export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSession();
  return (
    <main className="mx-auto max-w-3xl px-6 py-10 space-y-6">
      <a href="/community" className="text-rat-400">
        ← Community
      </a>
      <ThreadClient id={id} handle={user?.handle ?? null} />
    </main>
  );
}
