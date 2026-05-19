import type {
  AdminActivityResponse,
  AdminReferrersResponse,
  AdminSignupsResponse,
} from "@token-rats/contracts";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Avatar } from "../../components/ui/Avatar";
import { ApiError, getAdminActivity, getAdminReferrers, getAdminSignups } from "../../lib/api";
import { getCookieHeader, requireSession } from "../../lib/auth";
import { AdminDashboard } from "./AdminDashboard";

export const runtime = "edge";

export const metadata: Metadata = {
  title: "Admin · Token Rats",
};

export default async function AdminPage() {
  const user = await requireSession();
  const cookieHeader = await getCookieHeader();

  // The API is the source of truth for admin access. If we get a 403 from
  // any of the three endpoints, we redirect non-admins back to the app
  // root. No duplicate web-side env var to keep in sync.
  let signups: AdminSignupsResponse;
  let activity: AdminActivityResponse;
  let referrers: AdminReferrersResponse;
  try {
    [signups, activity, referrers] = await Promise.all([
      getAdminSignups(cookieHeader),
      getAdminActivity(cookieHeader),
      getAdminReferrers(cookieHeader),
    ]);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      redirect("/");
    }
    throw err;
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <a href="/" className="text-lg font-black tracking-tight">
              Token <span className="text-rat-500">Rats</span>
            </a>
            <span className="rounded-md border border-rat-700/60 bg-rat-700/10 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-rat-400">
              Admin
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Avatar src={user.avatarUrl} handle={user.handle} size="sm" />
            <span className="hidden text-sm font-semibold sm:block">@{user.handle}</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <AdminDashboard signups={signups} activity={activity} referrers={referrers} />
      </main>
    </div>
  );
}
