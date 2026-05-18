/**
 * /settings/profile — server component.
 * Auth-required: redirects to /signin if unauthenticated.
 *
 * Reads the current user's profile settings and passes them to the
 * client-side form for editing.
 */
import { requireSession, getCookieHeader } from "@/lib/auth";
import { getMe } from "@/lib/api";
import { ProfileSettingsClient } from "./Client";

export const runtime = "edge";

export const metadata = {
  title: "Profile Settings",
};

export default async function ProfileSettingsPage() {
  const currentUser = await requireSession();
  const cookieHeader = await getCookieHeader();

  // Don't catch — if /me fails we'd render the form with default values
  // (publicProfile: false, empty bio) and the user could silently overwrite
  // their real settings by submitting. Let Next's error boundary handle it
  // so the user sees an error page instead of broken pre-fill.
  const data = await getMe(cookieHeader);
  const publicProfile = data.user.publicProfile ?? false;
  const bio = data.user.bio ?? null;
  const twitterHandle = data.user.twitterHandle ?? null;

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

        <h1 className="text-2xl font-bold mb-2">Profile Settings</h1>
        <p className="text-zinc-400 mb-8">
          Control your public presence on Token Rats.
        </p>

        <ProfileSettingsClient
          handle={currentUser.handle}
          initialPublicProfile={publicProfile}
          initialBio={bio}
          initialTwitterHandle={twitterHandle}
        />
      </div>
    </main>
  );
}
