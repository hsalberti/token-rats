/**
 * /o/[slug]/pending — founder-only view of a reserved (status='pending') org.
 *
 * v1.2 Track AA. Server component:
 *   - Reads /v1/orgs/<slug> with the request cookie.
 *   - Renders 404 to non-founders (the API already returns 404 in that case).
 *   - Renders the queue position + a re-submit form that the founder can use
 *     to update slug / plan / note. The form posts to /v1/orgs (same handler
 *     handles idempotent updates by slug + founder).
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCookieHeader, getSession } from "../../../../lib/auth";
import { getOrg, ApiError } from "../../../../lib/api";
import { Card } from "../../../../components/ui/Card";
import { PendingEditForm } from "./PendingEditForm";

export const runtime = "edge";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Reserved: ${slug}` };
}

export default async function PendingOrgPage({ params }: Props) {
  const { slug } = await params;
  const user = await getSession();
  if (!user) notFound();

  const cookieHeader = await getCookieHeader();

  let data;
  try {
    data = await getOrg(slug, cookieHeader);
  } catch (err) {
    if (err instanceof ApiError) notFound();
    throw err;
  }

  const { org, members, waitlistPosition } = data;

  // If the API surfaced an active org via this route, redirect-style 404 —
  // the canonical home for active orgs is /o/<slug>.
  if (org.status !== "pending") notFound();

  const ownerMember = members.find((m) => m.role === "owner");
  const isFounder = ownerMember?.userId === user.id;
  if (!isFounder) notFound();

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-4">
          <a href="/app" className="text-sm text-zinc-500 hover:text-zinc-300">
            ← Dashboard
          </a>
          <a href="/" className="text-lg font-black tracking-tight">
            Token <span className="text-rat-500">Rats</span>
          </a>
          <div className="w-16" />
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-12 space-y-8">
        <div>
          <span className="inline-block rounded-full bg-amber-900/30 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-amber-300">
            Reserved
          </span>
          <h1 className="mt-3 text-3xl font-black tracking-tight">
            Your org <span className="text-rat-400">{org.name}</span> is reserved.
          </h1>
          <p className="mt-2 text-zinc-400">
            Founder: <span className="font-semibold text-zinc-200">@{ownerMember?.handle}</span>
            {" · "}
            Plan: <span className="font-semibold text-zinc-200">{org.plan}</span>
          </p>
        </div>

        <Card>
          <div className="flex items-center gap-4">
            <div className="text-5xl font-black tabular-nums text-rat-400">
              #{waitlistPosition ?? "?"}
            </div>
            <div className="text-sm text-zinc-400">
              <div className="font-semibold text-zinc-200">on the waitlist</div>
              <div>
                We&apos;re approving in batches — student orgs and friend-wave requests first.
                You&apos;ll get an email when we flip the switch.
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-zinc-500">
            Update your application
          </h2>
          <p className="mb-4 text-sm text-zinc-400">
            Re-submitting with the same slug just updates your application — it won&apos;t create a
            duplicate.
          </p>
          <PendingEditForm
            initialName={org.name}
            initialSlug={org.slug ?? slug}
            initialPlan={org.plan}
            initialGithubOrgLogin={org.githubOrgLogin ?? ""}
          />
        </Card>

        <p className="text-center text-xs text-zinc-600">
          Questions? Email{" "}
          <a className="underline" href="mailto:hello@tokenrats.com">
            hello@tokenrats.com
          </a>
          .
        </p>
      </main>
    </div>
  );
}
