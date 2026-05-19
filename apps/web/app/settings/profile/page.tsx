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
  const twitterVerified = data.user.twitterVerified ?? false;
  const email = data.user.email ?? null;

  return (
    <main className="text-zinc-100 px-6 py-8">
      <div className="max-w-lg mx-auto">
        <h2 className="text-xl font-bold mb-2">Profile</h2>
        <p className="text-zinc-400 mb-8">Control your public presence on Token Rats.</p>

        {/* Email — captured from GitHub, read-only. v1.2. */}
        <section className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Email
          </p>
          {email ? (
            <>
              <p className="font-mono text-zinc-200">{email}</p>
              <p className="mt-1 text-xs text-zinc-500">
                Connected via GitHub. Change it in your GitHub email settings and re-sign in to
                update.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-zinc-300">No email on file yet.</p>
              <p className="mt-1 text-xs text-zinc-500">
                Add a primary, verified email on{" "}
                <a
                  className="underline hover:text-zinc-300"
                  href="https://github.com/settings/emails"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  github.com/settings/emails
                </a>{" "}
                and sign in again — we'll capture it automatically.
              </p>
            </>
          )}
        </section>

        <ProfileSettingsClient
          handle={currentUser.handle}
          initialPublicProfile={publicProfile}
          initialBio={bio}
          initialTwitterHandle={twitterHandle}
          initialTwitterVerified={twitterVerified}
        />
      </div>
    </main>
  );
}
