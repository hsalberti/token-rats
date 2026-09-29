import type { SetupDetail as Detail } from "@token-rats/contracts";
import { notFound } from "next/navigation";
import { AuthedTopBar } from "../../../components/AuthedTopBar";
import { SetupDetail } from "../../../components/setups/SetupDetail";
import { ApiError } from "../../../lib/api";
import { getCookieHeader, getSession } from "../../../lib/auth";
import { getServerLocale } from "../../../lib/server-locale";
import { socialRequest } from "../../../lib/social";
export const runtime = "edge";
type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string }> };
async function read({ params, searchParams }: Props) {
  const { id } = await params;
  const { v } = await searchParams;
  try {
    return await socialRequest<Detail>(`setups/${id}${v ? `?v=${encodeURIComponent(v)}` : ""}`, {
      cookieHeader: await getCookieHeader(),
    });
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
}
export async function generateMetadata(props: Props) {
  const data = await read(props);
  const v = data.version;
  return {
    title: `${v.name} · @${v.handle}`,
    description: v.note || `Explore ${v.name}, version ${v.number}`,
    robots: v.publishedAt ? undefined : { index: false, follow: false },
    openGraph: v.publishedAt
      ? { images: [{ url: `/cards/setups/${v.id}`, width: 1200, height: 630 }] }
      : undefined,
  };
}
export default async function Page(props: Props) {
  const [data, user] = await Promise.all([read(props), getSession()]);
  return (
    <>
      {user ? (
        <AuthedTopBar user={user} locale={await getServerLocale()} />
      ) : (
        <header className="border-b border-zinc-800 px-6 py-5">
          <div className="mx-auto flex max-w-5xl justify-between">
            <a href="/" className="font-bold">
              Token <span className="text-rat-400">Rats</span>
            </a>
            <a href="/signin" className="text-sm text-rat-400">
              Sign in
            </a>
          </div>
        </header>
      )}
      <main className="mx-auto max-w-5xl px-6 py-8">
        <SetupDetail key={data.version.id} data={data} signedIn={!!user} />
      </main>
    </>
  );
}
