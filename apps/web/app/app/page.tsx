import type { Metadata } from "next";
import { requireSession, getCookieHeader } from "../../lib/auth";
import { Avatar } from "../../components/ui/Avatar";
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
          <div className="flex items-center gap-4">
            <a href="/" className="text-lg font-black tracking-tight">
              Token <span className="text-rat-500">Rats</span>
            </a>
            <nav className="hidden text-sm text-zinc-400 sm:flex sm:items-center sm:gap-3">
              <span className="text-zinc-600">/</span>
              <a href="/app" className="font-semibold text-zinc-100">
                Rooms
              </a>
              <span className="text-zinc-600">·</span>
              <a href="/app/friends" className="hover:text-zinc-200">
                Friends
              </a>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/app/friends"
              className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm font-semibold text-zinc-200 hover:bg-zinc-700 sm:hidden"
            >
              Friends
            </a>
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
