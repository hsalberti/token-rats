import type { Metadata } from "next";
import { Avatar } from "../../components/ui/Avatar";
import { getCookieHeader, requireSession } from "../../lib/auth";
import { DashboardClient } from "./DashboardClient";

export const runtime = "edge";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function AppPage() {
  const user = await requireSession();
  const cookieHeader = await getCookieHeader();

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Top bar */}
      <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <a href="/" className="text-lg font-black tracking-tight">
            Token <span className="text-rat-500">Rats</span>
          </a>
          <div className="flex items-center gap-3">
            <Avatar src={user.avatarUrl} handle={user.handle} size="sm" />
            <span className="hidden text-sm font-semibold sm:block">@{user.handle}</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        <DashboardClient user={user} cookieHeader={cookieHeader} />
      </main>
    </div>
  );
}
