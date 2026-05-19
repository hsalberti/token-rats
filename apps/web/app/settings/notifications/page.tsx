import { getNotificationPrefs } from "@/lib/api";
/**
 * /settings/notifications — server component.
 * Auth-required: redirects to /signin if unauthenticated.
 */
import { getCookieHeader, requireSession } from "@/lib/auth";
import { NotificationsClient } from "./Client";

export const runtime = "edge";

export const metadata = {
  title: "Notification Settings",
};

export default async function NotificationsSettingsPage() {
  await requireSession();
  const cookieHeader = await getCookieHeader();

  // Don't catch — defaults would render the user's current opt-outs as
  // opted in, and submitting would silently flip them. Let the error
  // boundary handle the failure.
  const { prefs } = await getNotificationPrefs(cookieHeader);

  return (
    <main className="text-zinc-100 px-6 py-8">
      <div className="max-w-lg mx-auto">
        <h2 className="text-xl font-bold mb-2">Notifications</h2>
        <p className="text-zinc-400 mb-8">Control how Token Rats reaches you.</p>

        <NotificationsClient initialPrefs={prefs} />
      </div>
    </main>
  );
}
