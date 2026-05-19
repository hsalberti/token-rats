import { getReferral } from "@/lib/api";
/**
 * /settings/referrals — server component.
 * Auth-required. Loads the user's referral code + recent referrals from the
 * API and renders the share-link UI.
 */
import { getCookieHeader, requireSession } from "@/lib/auth";
import type { ReferralStats } from "@token-rats/contracts";
import { headers } from "next/headers";
import { ReferralsClient } from "./Client";

export const runtime = "edge";

export const metadata = {
  title: "Invite friends",
};

export default async function ReferralsPage() {
  await requireSession();
  const cookieHeader = await getCookieHeader();

  // If /v1/me/referral hiccups we don't want the whole page to 500 — the
  // user still deserves a working header + a clear retry path. Render an
  // empty-state shell on failure instead of throwing.
  let referral: ReferralStats | null = null;
  try {
    const data = await getReferral(cookieHeader);
    referral = data.referral;
  } catch {
    referral = null;
  }

  // Read origin from request headers so the share link renders identically
  // on SSR and after hydration — no client-only `window.location` reads.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const origin = host ? `${proto}://${host}` : "https://tokenrats.com";

  return (
    <main className="text-zinc-100 px-6 py-8">
      <div className="max-w-lg mx-auto">
        <h2 className="text-xl font-bold mb-2">Invite friends</h2>
        <p className="text-zinc-400 mb-8">
          Share your link. When a friend signs up through it we credit it to you, so we can hand out
          rewards later.
        </p>

        {referral ? (
          <ReferralsClient initial={referral} origin={origin} />
        ) : (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 text-center">
            <p className="text-sm text-zinc-300">
              Couldn&apos;t load your referral stats right now.
            </p>
            <p className="mt-1 text-xs text-zinc-500">Refresh the page in a moment.</p>
          </div>
        )}
      </div>
    </main>
  );
}
