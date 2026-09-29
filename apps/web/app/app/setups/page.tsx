import type { SetupVersion } from "@token-rats/contracts";
import { AuthedTopBar } from "../../../components/AuthedTopBar";
import { AgentCapture } from "../../../components/setups/AgentCapture";
import { SetupCard } from "../../../components/setups/SetupCard";
import { getCookieHeader, requireSession } from "../../../lib/auth";
import { getServerLocale } from "../../../lib/server-locale";
import { socialRequest } from "../../../lib/social";
export const runtime = "edge";
export const metadata = { title: "My setups" };
export default async function Page() {
  const user = await requireSession();
  const cookieHeader = await getCookieHeader();
  const [mine, shelf] = await Promise.all([
    socialRequest<{ versions: SetupVersion[] }>("setups/mine", { cookieHeader }),
    socialRequest<{ versions: (SetupVersion & { shelf: { status: string } })[] }>(
      "setups/library",
      { cookieHeader },
    ),
  ]);
  return (
    <>
      <AuthedTopBar user={user} locale={await getServerLocale()} />
      <main className="mx-auto max-w-5xl space-y-8 px-6 py-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black">My setups</h1>
            <p className="mt-2 text-sm text-zinc-400">
              Keep a history of what you tried, kept, and changed.
            </p>
          </div>
          <a href="/setups/new" className="rounded-lg bg-rat-500 px-4 py-2 font-bold text-black">
            New setup
          </a>
        </header>
        <AgentCapture />
        {!mine.versions.length && (
          <p className="rounded-xl border border-dashed border-zinc-700 p-8 text-zinc-400">
            Start with an AGENTS.md, a few favorite tools, or a workflow you want to remember. Your
            first version can stay private.
          </p>
        )}
        <div className="grid gap-5 md:grid-cols-2">
          {mine.versions.map((v) => (
            <SetupCard key={v.id} version={v} />
          ))}
        </div>
        <section>
          <h2 className="mb-4 text-xl font-bold">My shelf</h2>
          {!shelf.versions.length && (
            <p className="text-sm text-zinc-500">
              Save a setup from someone else to keep track of what you want to try.
            </p>
          )}
          <div className="grid gap-5 md:grid-cols-2">
            {shelf.versions.map((v) => (
              <div key={v.id}>
                <p className="mb-2 text-xs uppercase tracking-wider text-rat-400">
                  {v.shelf?.status.replaceAll("_", " ")}
                </p>
                <SetupCard version={v} />
              </div>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
