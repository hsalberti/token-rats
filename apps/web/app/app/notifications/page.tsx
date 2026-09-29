import type { SocialNotice, SocialPrefs } from "@token-rats/contracts";
import { AuthedTopBar } from "../../../components/AuthedTopBar";
import { Inbox } from "../../../components/setups/Inbox";
import { getCookieHeader, requireSession } from "../../../lib/auth";
import { getServerLocale } from "../../../lib/server-locale";
import { socialRequest } from "../../../lib/social";
export const runtime = "edge";
export const metadata = { title: "Inbox" };
export default async function Page() {
  const user = await requireSession();
  const options = { cookieHeader: await getCookieHeader() };
  const [data, prefs, releasePrefs] = await Promise.all([
    socialRequest<{ notifications: SocialNotice[] }>("social/notifications", options),
    socialRequest<{ prefs: SocialPrefs; emailConfigured: boolean }>("social/preferences", options),
    socialRequest<{ productEmails: boolean }>("releases/preferences", options),
  ]);
  return (
    <>
      <AuthedTopBar user={user} locale={await getServerLocale()} />
      <main className="mx-auto max-w-5xl px-6 py-8">
        <Inbox
          initial={data.notifications}
          prefs={prefs.prefs}
          emailConfigured={prefs.emailConfigured}
          productEmails={releasePrefs.productEmails}
        />
      </main>
    </>
  );
}
