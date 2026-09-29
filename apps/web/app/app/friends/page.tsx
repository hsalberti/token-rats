import { AuthedTopBar } from "../../../components/AuthedTopBar";
import { FriendsDirectory, type Person } from "../../../components/setups/FriendsDirectory";
import { getCookieHeader, requireSession } from "../../../lib/auth";
import { getServerLocale } from "../../../lib/server-locale";
import { socialRequest } from "../../../lib/social";
export const runtime = "edge";
export const metadata = { title: "Friends" };
export default async function FriendsPage() {
  const user = await requireSession();
  const result = await socialRequest<{ people: Person[] }>("setups/people?friends=1", {
    cookieHeader: await getCookieHeader(),
  });
  return (
    <>
      <AuthedTopBar user={user} locale={await getServerLocale()} />
      <main className="mx-auto max-w-3xl px-6 py-8">
        <FriendsDirectory initial={result.people} />
      </main>
    </>
  );
}
