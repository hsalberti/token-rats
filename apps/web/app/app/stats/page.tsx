import { AuthedTopBar } from "../../../components/AuthedTopBar";
import { SourceTiles } from "../../../components/SourcePill";
import { api } from "../../../lib/api";
import { getCookieHeader, requireSession } from "../../../lib/auth";
import { getServerLocale } from "../../../lib/server-locale";
export const runtime = "edge";
export const metadata = { title: "My usage" };
export default async function Page() {
  const user = await requireSession();
  const { profile } = await api.getProfile(user.handle, await getCookieHeader());
  return (
    <>
      <AuthedTopBar user={user} locale={await getServerLocale()} />
      <main className="mx-auto max-w-4xl space-y-8 px-6 py-8">
        <h1 className="text-3xl font-black">Your usage</h1>
        <p className="text-zinc-400">A record of your activity across agents and apps.</p>
        <div className="grid gap-4 sm:grid-cols-3">
          {(
            [
              ["today", "Today"],
              ["week", "This week"],
              ["allTime", "All time"],
            ] as const
          ).map(([key, label]) => (
            <section key={key} className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
              <h2 className="text-sm text-zinc-400">{label}</h2>
              <p className="mt-2 text-3xl font-black">
                {Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(
                  profile.totals[key].tokens,
                )}
              </p>
              <p className="text-xs text-zinc-500">tokens</p>
            </section>
          ))}
        </div>
        <SourceTiles sources={profile.sources ?? []} />
        <div className="flex flex-wrap gap-5 text-rat-400">
          <a href="/app/compare">Subscriptions and costs →</a>
          <a href="/app/devices">Devices and sync →</a>
          <a href={`/u/${user.handle}`}>Activity history →</a>
          <a href="/sources">Connect a source →</a>
        </div>
      </main>
    </>
  );
}
