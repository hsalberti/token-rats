/**
 * /o/[slug] — Org overview (member-only).
 *
 * Server component: fetches org + members on the server.
 * Redirects to /signin if unauthenticated, 404s if slug unknown or not a member.
 */

import type { GetOrgResponse } from "@token-rats/contracts";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Avatar } from "../../../components/ui/Avatar";
import { Card } from "../../../components/ui/Card";
import { Wordmark } from "../../../components/ui/Wordmark.js";
import { ApiError, getOrg } from "../../../lib/api";
import { getCookieHeader, getSession } from "../../../lib/auth";

export const runtime = "edge";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Org: ${slug}` };
}

export default async function OrgOverviewPage({ params }: Props) {
  const { slug } = await params;
  const cookieHeader = await getCookieHeader();
  const user = await getSession();
  if (!user) notFound();

  let orgRes: GetOrgResponse;
  try {
    orgRes = await getOrg(slug, cookieHeader);
  } catch (err) {
    if (err instanceof ApiError) notFound();
    throw err;
  }

  const { org, members } = orgRes;

  // Pending orgs always redirect to the confirmation page for the founder.
  // The API only returns a pending org to its founder, so reaching this
  // branch as a non-founder is impossible.
  if (org.status === "pending") {
    redirect(`/o/${slug}/pending`);
  }

  const member = members.find((m) => m.userId === user.id);
  if (!member) notFound();
  const membership = { role: member.role };

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <a href="/app" className="text-sm text-zinc-500 hover:text-zinc-300">
            ← Dashboard
          </a>
          <a href="/">
            <Wordmark size="md" />
          </a>
          <div className="w-16" />
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8 space-y-8">
        {/* Org header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-black tracking-tight">{org.name}</h1>
            <p className="mt-1 text-sm text-zinc-500">
              {org.slug ? `tokenrats.com/o/${org.slug}` : ""} &middot;{" "}
              <span className={org.plan === "pro" ? "font-semibold text-rat-400" : "text-zinc-500"}>
                {org.plan === "pro" ? "Pro" : "Free"} plan
              </span>
              {org.seatCount > 0 && (
                <>
                  {" "}
                  &middot; {org.seatCount} seat{org.seatCount !== 1 ? "s" : ""}
                </>
              )}
            </p>
          </div>

          {/* Nav links */}
          <nav className="flex gap-3">
            <a
              href={`/o/${slug}/dashboard`}
              className="rounded-lg px-3 py-1.5 text-sm font-semibold text-zinc-300 hover:bg-zinc-800"
            >
              Dashboard
            </a>
            {(membership.role === "owner" || membership.role === "admin") && (
              <a
                href={`/o/${slug}/members`}
                className="rounded-lg px-3 py-1.5 text-sm font-semibold text-zinc-300 hover:bg-zinc-800"
              >
                Members
              </a>
            )}
            <a
              href={`/o/${slug}/billing`}
              className="rounded-lg px-3 py-1.5 text-sm font-semibold text-zinc-300 hover:bg-zinc-800"
            >
              Billing
            </a>
          </nav>
        </div>

        {/* Members card */}
        <Card>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-zinc-500">
            Members ({members.length})
          </h2>
          <ul className="space-y-3">
            {members.map((m) => (
              <li key={m.userId} className="flex items-center gap-3">
                <Avatar src={m.avatarUrl} handle={m.handle} size="sm" />
                <span className="flex-1 font-semibold">@{m.handle}</span>
                <span
                  className={[
                    "rounded px-2 py-0.5 text-xs font-semibold",
                    m.role === "owner"
                      ? "bg-rat-900/30 text-rat-400"
                      : m.role === "admin"
                        ? "bg-zinc-800 text-zinc-300"
                        : "bg-zinc-900 text-zinc-500",
                  ].join(" ")}
                >
                  {m.role}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        {/* Quick links */}
        <div className="grid gap-4 sm:grid-cols-3">
          <a
            href={`/o/${slug}/dashboard`}
            className="flex flex-col gap-1 rounded-xl border border-zinc-800 bg-zinc-900 p-5 hover:border-zinc-700 transition-colors"
          >
            <span className="text-2xl">📊</span>
            <span className="font-bold">Spend dashboard</span>
            <span className="text-sm text-zinc-500">Burn by person, model, and day</span>
          </a>
          {(membership.role === "owner" || membership.role === "admin") && (
            <a
              href={`/o/${slug}/members`}
              className="flex flex-col gap-1 rounded-xl border border-zinc-800 bg-zinc-900 p-5 hover:border-zinc-700 transition-colors"
            >
              <span className="text-2xl">👥</span>
              <span className="font-bold">Manage members</span>
              <span className="text-sm text-zinc-500">Invite via GitHub or email</span>
            </a>
          )}
          <a
            href={`/o/${slug}/billing`}
            className="flex flex-col gap-1 rounded-xl border border-zinc-800 bg-zinc-900 p-5 hover:border-zinc-700 transition-colors"
          >
            <span className="text-2xl">💳</span>
            <span className="font-bold">Billing</span>
            <span className="text-sm text-zinc-500">
              {org.plan === "pro" ? "Manage your subscription" : "Upgrade to Pro"}
            </span>
          </a>
        </div>
      </main>
    </div>
  );
}
