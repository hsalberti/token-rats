import type { SetupFeed } from "@token-rats/contracts";
import { AuthedTopBar } from "../../components/AuthedTopBar";
import { Feed } from "../../components/setups/Feed";
import { getCookieHeader, requireSession } from "../../lib/auth";
import { getServerLocale } from "../../lib/server-locale";
import { socialRequest } from "../../lib/social";
export const runtime = "edge";
export const metadata = { title: "Your feed" };
export default async function Page() {
  const user = await requireSession();
  const data = await socialRequest<SetupFeed>("setups/feed", {
    cookieHeader: await getCookieHeader(),
  });
  return (
    <>
      <AuthedTopBar user={user} locale={await getServerLocale()} />
      <main className="mx-auto max-w-5xl px-6 py-8">
        <Feed initial={data} />
      </main>
    </>
  );
}
