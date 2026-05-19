import { getReferral } from "@/lib/api";
/**
 * /settings/referrals — server component.
 * Auth-required. Loads the user's referral code + recent referrals from the
 * API and renders the share-link UI.
 */
import { getCookieHeader, requireSession } from "@/lib/auth";
import { ReferralsClient } from "./Client";

export const runtime = "edge";

export const metadata = {
  title: "Invite friends",
};

export default async function ReferralsPage() {
  await requireSession();
  const cookieHeader = await getCookieHeader();

  const { referral } = await getReferral(cookieHeader);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
      <div className="max-w-lg mx-auto">
        <div className="mb-8">
          <a href="/app" className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
            &larr; Back to app
          </a>
        </div>

        <h1 className="text-2xl font-bold mb-2">Invite friends</h1>
        <p className="text-zinc-400 mb-8">
          Share your link. When a friend signs up through it we credit it to you, so we can hand out
          rewards later.
        </p>

        <ReferralsClient initial={referral} />
      </div>
    </main>
  );
}
