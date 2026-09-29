import { type ProfileShare, ProfileShareQuery, profileShareSearch } from "@token-rats/contracts";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProfileShareButton } from "../../../../components/ProfileShareButton";
import { Wordmark } from "../../../../components/ui/Wordmark";
import { ApiError } from "../../../../lib/api";
import { socialRequest } from "../../../../lib/social";

export const runtime = "edge";
type Props = {
  params: Promise<{ handle: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { handle } = await params;
  const query = ProfileShareQuery.safeParse(await searchParams);
  if (!query.success) return { title: "Profile card", robots: { index: false } };
  const title = `@${handle}'s agent brief · Token Rats`;
  const description = "30 days of tokens, favorite models, and the instructions behind them.";
  const url = `/cards/u/${encodeURIComponent(handle)}${profileShareSearch(query.data)}`;
  return {
    title,
    description,
    openGraph: { title, description, images: [{ url, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description, images: [url] },
  };
}

export default async function ProfileSharePage({ params, searchParams }: Props) {
  const { handle } = await params;
  const query = ProfileShareQuery.safeParse(await searchParams);
  if (!query.success) notFound();
  let share: ProfileShare;
  try {
    ({ share } = await socialRequest<{ share: ProfileShare }>(
      `u/${encodeURIComponent(handle)}/share${profileShareSearch(query.data)}`,
    ));
  } catch (err) {
    if (err instanceof ApiError && [400, 404].includes(err.status)) notFound();
    throw err;
  }
  // Pin the preview, download, and repost to the same published version and excerpt.
  const selection = share.instructions
    ? {
        version: share.instructions.versionId,
        file: share.instructions.file,
        start: share.instructions.start,
        end: share.instructions.end,
      }
    : {};
  return (
    <main className="mx-auto max-w-5xl space-y-7 px-5 py-10 sm:py-16">
      <a href="/">
        <Wordmark size="md" />
      </a>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mt-6 text-3xl font-black">@{share.handle}’s agent brief</h1>
          <p className="mt-2 text-zinc-400">
            The models, the tokens, and the instructions behind the work.
          </p>
        </div>
        <ProfileShareButton handle={share.handle} selection={selection} label="Share" />
      </div>
      <img
        src={`/cards/u/${encodeURIComponent(handle)}${profileShareSearch(selection)}`}
        width={1200}
        height={630}
        alt={`@${share.handle}: ${share.tokens.toLocaleString("en-US")} tokens in the last 30 days. Top model: ${share.topModel ?? "none"}. Top provider: ${share.topProvider ?? "none"}.`}
        className="h-auto w-full rounded-2xl border border-zinc-800"
      />
      {share.instructions && (
        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="mb-3 text-sm font-semibold">
            {share.instructions.fileName} · Lines {share.instructions.start}–
            {share.instructions.end}
          </h2>
          <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-7 text-zinc-300">
            {share.instructions.text}
          </pre>
          <a
            className="mt-4 inline-block text-sm text-rat-400"
            href={`/setups/${share.instructions.setupId}?v=${share.instructions.versionId}`}
          >
            Read this setup version →
          </a>
        </section>
      )}
      <a className="inline-block text-rat-400" href={`/u/${encodeURIComponent(handle)}`}>
        View @{share.handle}’s profile →
      </a>
    </main>
  );
}
