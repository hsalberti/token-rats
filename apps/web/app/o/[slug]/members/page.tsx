/**
 * /o/[slug]/members — Manage org members + send invites (admin/owner only).
 *
 * Hybrid: the page shell is a server component that checks membership and
 * renders the member list. The invite form is a client component.
 */

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCookieHeader } from "../../../../lib/auth";
import { requireOrgAdmin } from "../../../../lib/org-auth";
import { MembersClient } from "./MembersClient";

export const runtime = "edge";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Members — ${slug}` };
}

export default async function OrgMembersPage({ params }: Props) {
  const { slug } = await params;
  const cookieHeader = await getCookieHeader();

  const membership = await requireOrgAdmin(slug, cookieHeader);
  if (!membership) notFound();

  const { org, members } = membership;

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <a
            href={`/o/${slug}`}
            className="text-sm text-zinc-500 hover:text-zinc-300"
          >
            ← {org.name}
          </a>
          <a href="/" className="text-lg font-black tracking-tight">
            Token <span className="text-rat-500">Rats</span>
          </a>
          <div className="w-16" />
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        <MembersClient slug={slug} initialMembers={members} />
      </main>
    </div>
  );
}
