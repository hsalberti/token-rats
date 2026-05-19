/**
 * /settings/notifications — server component.
 * Auth-required: redirects to /signin if unauthenticated.
 */
import { requireSession, getCookieHeader } from "@/lib/auth";
import { getMe, getNotificationPrefs } from "@/lib/api";
import { NotificationsClient } from "./Client";

export const runtime = "edge";

export const metadata = {
  title: "Notification Settings",
};

export default async function NotificationsSettingsPage() {
  await requireSession();
  const cookieHeader = await getCookieHeader();

  // Don't catch prefs — defaults would render the user's current opt-outs as
  // opted in, and submitting would silently flip them. Let the error
  // boundary handle the failure.
  const [{ prefs }, { user }] = await Promise.all([
    getNotificationPrefs(cookieHeader),
    getMe(cookieHeader),
  ]);
  const email = user.email ?? null;

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
      <div className="max-w-lg mx-auto">
        <div className="mb-8">
          <a
            href="/app"
            className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            &larr; Back to app
          </a>
        </div>

        <h1 className="text-2xl font-bold mb-2">Notification Settings</h1>
        <p className="text-zinc-400 mb-8">
          Control how Token Rats reaches you.
        </p>

        <NotificationsClient initialPrefs={prefs} email={email} />
      </div>
    </main>
  );
}
