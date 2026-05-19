import type { Metadata } from "next";
import { UserMenu } from "../../components/UserMenu";
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
          <UserMenu user={user} />
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        <DashboardClient user={user} cookieHeader={cookieHeader} />
      </main>
    </div>
  );
}
