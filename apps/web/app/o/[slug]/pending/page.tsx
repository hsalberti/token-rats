/**
 * /o/[slug]/pending — confirmation page for a pending org.
 *
 * Visible only to the founder while `status='pending'`. If the org is
 * already approved we redirect to `/o/[slug]`. Anyone else gets 404 (the
 * `getOrg` call 403s, which we surface as not-found).
 */

import { notFound, redirect } from "next/navigation";
import { Card } from "../../../../components/ui/Card";
import { ApiError, getOrg } from "../../../../lib/api";
import { getCookieHeader, requireSession } from "../../../../lib/auth";
import { PendingOrgForm } from "./PendingOrgForm";

export const runtime = "edge";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function PendingOrgPage({ params }: Props) {
  const { slug } = await params;
  await requireSession();
  const cookieHeader = await getCookieHeader();

  let org;
  try {
    const res = await getOrg(slug, cookieHeader);
    org = res.org;
  } catch (err) {
    if (err instanceof ApiError && (err.status === 403 || err.status === 404)) {
      notFound();
    }
    throw err;
  }

  if (org.status === "approved") {
    redirect(`/o/${slug}`);
  }

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
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="text-5xl">🕒</span>
          <h1 className="text-3xl font-black tracking-tight">You're on the waitlist</h1>
          <p className="max-w-md text-zinc-400">
            <strong className="text-zinc-200">{org.name}</strong> is queued for approval. We review
            requests in batches — you'll hear from us at the email below.
          </p>
        </div>

        <Card>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                Reserved slug
              </p>
              <p className="font-mono text-zinc-200">tokenrats.com/o/{org.slug}</p>
            </div>
            <span className="rounded-md border border-rat-700/60 bg-rat-700/10 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-rat-400">
              {org.requestedPlan ?? "free"}
            </span>
          </div>
        </Card>

        <PendingOrgForm
          slug={slug}
          initialEmail={org.founderEmail ?? ""}
          initialName={org.founderName ?? ""}
        />

        <p className="text-center text-xs text-zinc-600">
          The slug is locked. If you typo'd it, contact support after approval to rename.
        </p>
      </main>
    </div>
  );
}
