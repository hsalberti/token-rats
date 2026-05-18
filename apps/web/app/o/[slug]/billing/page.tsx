/**
 * /o/[slug]/billing — Current plan + Stripe Customer Portal link.
 *
 * The "Manage billing" button links to STRIPE_PORTAL_URL (an env var that
 * must be set to your Stripe Customer Portal URL, e.g.
 *   https://billing.stripe.com/p/login/<your_portal_id>
 * ).
 *
 * Server component: reads org membership and renders plan details.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCookieHeader } from "../../../../lib/auth";
import { getOrgMembership } from "../../../../lib/org-auth";
import { Card } from "../../../../components/ui/Card";

export const runtime = "edge";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Billing — ${slug}` };
}

/**
 * The Stripe Customer Portal URL.
 * Set STRIPE_PORTAL_URL in your Next.js environment:
 *   https://billing.stripe.com/p/login/<portal_id>
 *
 * Exposed via NEXT_PUBLIC_ so it can be read from the server component.
 * Keep it NEXT_PUBLIC_ only if the URL contains no secrets — the portal URL
 * itself is not secret (Stripe authenticates the customer session server-side).
 */
const STRIPE_PORTAL_URL =
  process.env.STRIPE_PORTAL_URL ??
  process.env.NEXT_PUBLIC_STRIPE_PORTAL_URL ??
  null;

export default async function OrgBillingPage({ params }: Props) {
  const { slug } = await params;
  const cookieHeader = await getCookieHeader();

  const membership = await getOrgMembership(slug, cookieHeader);
  if (!membership) notFound();

  const { org } = membership;
  const isPro = org.plan === "pro";

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-4">
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

      <main className="mx-auto max-w-2xl px-6 py-12 space-y-8">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Billing</h1>
          <p className="mt-1 text-zinc-500">{org.name}</p>
        </div>

        {/* Current plan card */}
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                Current plan
              </p>
              <p
                className={[
                  "mt-2 text-3xl font-black",
                  isPro ? "text-rat-400" : "text-zinc-100",
                ].join(" ")}
              >
                {isPro ? "Pro" : "Free"}
              </p>
              {isPro && org.seatCount > 0 && (
                <p className="mt-1 text-sm text-zinc-400">
                  {org.seatCount} seat{org.seatCount !== 1 ? "s" : ""}
                </p>
              )}
              {!isPro && (
                <p className="mt-2 text-sm text-zinc-400">
                  Upgrade to Pro for unlimited seats, private dashboards, and priority support.
                </p>
              )}
            </div>

            {isPro && (
              <span className="rounded-full bg-rat-900/30 px-3 py-1 text-xs font-bold text-rat-400">
                Active
              </span>
            )}
          </div>
        </Card>

        {/* Pro pricing */}
        {!isPro && (
          <Card>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-zinc-500">
              Pro plan
            </h2>
            <ul className="mb-5 space-y-2 text-sm text-zinc-300">
              <li>✓ Unlimited team members</li>
              <li>✓ Org-wide spend dashboard</li>
              <li>✓ GitHub org auto-invite</li>
              <li>✓ Priority support</li>
            </ul>
            <p className="mb-4 text-2xl font-black">
              $5 <span className="text-base font-normal text-zinc-500">/ seat / mo</span>
            </p>
            {STRIPE_PORTAL_URL ? (
              <a
                href={STRIPE_PORTAL_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-rat-500 px-6 py-2.5 text-base font-semibold text-white hover:bg-rat-600 transition-colors"
              >
                Upgrade to Pro
              </a>
            ) : (
              <p className="text-sm text-zinc-600 italic">
                Stripe portal not configured (set <code>STRIPE_PORTAL_URL</code>).
              </p>
            )}
          </Card>
        )}

        {/* Manage subscription (Pro only) */}
        {isPro && (
          <Card>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-zinc-500">
              Manage subscription
            </h2>
            <p className="mb-4 text-sm text-zinc-400">
              Update payment method, download invoices, or cancel your subscription via the
              Stripe Customer Portal.
            </p>
            {STRIPE_PORTAL_URL ? (
              <a
                href={STRIPE_PORTAL_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-800 px-6 py-2.5 text-base font-semibold text-zinc-100 hover:bg-zinc-700 transition-colors"
              >
                Manage billing
              </a>
            ) : (
              <p className="text-sm text-zinc-600 italic">
                Stripe portal not configured (set <code>STRIPE_PORTAL_URL</code>).
              </p>
            )}
          </Card>
        )}
      </main>
    </div>
  );
}
