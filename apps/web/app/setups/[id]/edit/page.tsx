import type { SetupDetail } from "@token-rats/contracts";
import { notFound } from "next/navigation";
import { AuthedTopBar } from "../../../../components/AuthedTopBar";
import { SetupEditor } from "../../../../components/setups/SetupEditor";
import { getCookieHeader, requireSession } from "../../../../lib/auth";
import { getServerLocale } from "../../../../lib/server-locale";
import { socialRequest } from "../../../../lib/social";
export const runtime = "edge";
export const metadata = { title: "Save a setup version", robots: { index: false, follow: false } };
export default async function Page({
  params,
  searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string }> }) {
  const user = await requireSession();
  const { id } = await params;
  const { v } = await searchParams;
  const data = await socialRequest<SetupDetail>(
    `setups/${id}${v ? `?v=${encodeURIComponent(v)}` : ""}`,
    { cookieHeader: await getCookieHeader() },
  );
  if (!data.isOwner) notFound();
  return (
    <>
      <AuthedTopBar user={user} locale={await getServerLocale()} />
      <main className="mx-auto max-w-3xl px-6 py-8">
        <a href={`/setups/${id}`} className="mb-5 inline-block text-sm text-rat-400">
          ← Back to setup
        </a>
        <SetupEditor initial={data.version} baseVersionId={data.history[0]?.id} />
      </main>
    </>
  );
}
