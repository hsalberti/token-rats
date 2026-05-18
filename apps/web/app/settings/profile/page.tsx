import { getMe } from "@/lib/api";
/**
 * /settings/profile — server component.
 * Auth-required: redirects to /signin if unauthenticated.
 *
 * Reads the current user's profile settings and passes them to the
 * client-side form for editing.
 */
import { getCookieHeader, requireSession } from "@/lib/auth";
import { ProfileSettingsClient } from "./Client";

export const metadata = {
  title: "Profile Settings",
};

export default async function ProfileSettingsPage() {
  const currentUser = await requireSession();
  const cookieHeader = await getCookieHeader();

  let publicProfile = false;
  let bio: string | null = null;
  let twitterHandle: string | null = null;

  try {
    const data = await getMe(cookieHeader);
    publicProfile = data.user.publicProfile ?? false;
    bio = data.user.bio ?? null;
    twitterHandle = data.user.twitterHandle ?? null;
  } catch {
    // Use defaults if fetch fails; the client form will still work
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
      <div className="max-w-lg mx-auto">
        <div className="mb-8">
          <a href="/app" className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
            &larr; Back to app
          </a>
        </div>

        <h1 className="text-2xl font-bold mb-2">Profile Settings</h1>
        <p className="text-zinc-400 mb-8">Control your public presence on Token Rats.</p>

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
