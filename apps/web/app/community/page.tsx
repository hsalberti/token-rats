import { getSession } from "@/lib/auth";
import { CommunityClient } from "./Client";
export const runtime = "edge";
export const metadata = {
  title: "Community — Token Rats",
  description: "Share AI workflows, ideas, and AGENTS.md files.",
};
export default async function CommunityPage() {
  const user = await getSession();
  return (
    <main className="mx-auto max-w-3xl px-6 py-10 space-y-6">
      <a href="/app" className="text-rat-400">
        Token Rats
      </a>
      <h1 className="text-3xl font-bold">Build and learn together</h1>
      <p className="text-zinc-400">
        Share ideas, AGENTS.md files, projects, and questions. Explain what worked and show the
        results.
      </p>
      <CommunityClient signedIn={!!user} />
    </main>
  );
}
