/**
 * /onboarding — Token Autobiography page.
 *
 * Auth-required server page. Fetches the user's autobiography stats from
 * GET /v1/u/:handle/autobiography and renders the animated reveal client
 * component. Users who have zero sessions see a "go run npx token-rats sync"
 * nudge instead of an empty autobiography.
 *
 * TODO (CLI wire-up): After `npx token-rats sync` succeeds for the first time,
 * print a line like:
 *   "  🐀  Your Token Autobiography is ready: https://tokenrats.com/onboarding"
 * This will make /onboarding discoverable from the CLI.
 */

import type { AutobiographyStats } from "@token-rats/contracts";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AutobiographyReveal } from "../../components/onboarding/AutobiographyReveal";
import { NodeInstallHint } from "../../components/NodeInstallHint";
import { ApiError, api } from "../../lib/api";
import { getCookieHeader, requireSession } from "../../lib/auth";

export const runtime = "edge";

export const metadata: Metadata = {
  title: "Your Token Autobiography",
  description: "Discover your AI token burn story — biggest sessions, favourite model, and more.",
};

export default async function OnboardingPage() {
  // Require auth — redirects to /signin if not logged in
  const user = await requireSession();
  const cookieHeader = await getCookieHeader();

  // Fetch autobiography stats
  let stats: AutobiographyStats | undefined;
  try {
    const resp = await api.getAutobiography(user.handle, cookieHeader);
    stats = resp.autobiography;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      redirect("/signin");
    }
    // Any other error — surface below
    stats = undefined;
  }

  // No sessions yet — show a friendly nudge
  if (!stats || stats.totalSessions === 0) {
    return <NoSessionsView handle={user.handle} />;
  }

  // Autobiography card URL for OG meta
  const cardUrl = `/cards/u/${user.handle}/autobiography`;

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Page-level OG tags injected via generateMetadata in a real app;
          here we at least set the link in the head via the card URL so
          the profile page still has the autobiography OG. */}

      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto flex max-w-xl items-center justify-between px-6 py-4">
          <a href="/" className="text-sm text-zinc-500 hover:text-zinc-300">
            ← Home
          </a>
          <a href="/" className="text-lg font-black tracking-tight">
            Token <span className="text-rat-500">Rats</span>
          </a>
          <a href="/app" className="text-sm text-zinc-500 hover:text-zinc-300">
            Dashboard →
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-6 py-10 space-y-6">
        {/* Hero intro */}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-rat-700/50 bg-rat-900/20 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-rat-500">
            <span>🐀</span>
            <span>Token Autobiography</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight text-zinc-100">
            @{user.handle},<br />
            <span className="text-rat-400">here&apos;s your story.</span>
          </h1>
          <p className="text-sm text-zinc-500">
            Every token you&apos;ve burned. Laid out stat by stat.
          </p>
        </div>

        {/* Share card preview link — small subtle CTA */}
        <div className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm">
          <span className="text-zinc-500">Share card:</span>
          <a
            href={cardUrl}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-rat-400 hover:text-rat-300 underline underline-offset-2 truncate"
          >
            /cards/u/{user.handle}/autobiography
          </a>
        </div>

        {/* Animated reveal — client component */}
        <AutobiographyReveal stats={stats} handle={user.handle} />
      </main>
    </div>
  );
}

// ---- No-sessions fallback ---------------------------------------------------

function NoSessionsView({ handle }: { handle: string }) {
  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center justify-between px-6 py-4">
          <a href="/" className="text-sm text-zinc-500 hover:text-zinc-300">
            ← Home
          </a>
          <a href="/" className="text-lg font-black tracking-tight">
            Token <span className="text-rat-500">Rats</span>
          </a>
          <div className="w-20" />
        </div>
      </header>

      <main className="mx-auto max-w-xl px-6 py-20 space-y-8 flex-1 flex flex-col items-center justify-center text-center">
        <div className="text-6xl">🐀</div>
        <div className="space-y-3">
          <h1 className="text-2xl font-black tracking-tight">
            @{handle}, you haven&apos;t synced yet.
          </h1>
          <p className="text-zinc-400">
            Run{" "}
            <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-rat-400 font-mono text-sm">
              npx token-rats sync
            </code>{" "}
            to upload your Claude Code + Cursor usage, then come back here.
          </p>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 text-left w-full">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Quick start
          </p>
          <div className="space-y-2 font-mono text-sm">
            <div className="flex items-center gap-2">
              <span className="text-zinc-600">$</span>
              <span className="text-zinc-300">npx token-rats login</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-zinc-600">$</span>
              <span className="text-zinc-300">npx token-rats sync</span>
            </div>
          </div>
          <NodeInstallHint />
        </div>

        <div className="flex gap-4">
          <a
            href="/app"
            className="inline-flex items-center gap-2 rounded-lg bg-rat-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-rat-600 transition-colors"
          >
            Go to dashboard
          </a>
          <a
            href="/onboarding"
            className="inline-flex items-center gap-2 rounded-lg bg-zinc-800 px-5 py-2.5 text-sm font-semibold text-zinc-100 hover:bg-zinc-700 transition-colors"
          >
            Refresh
          </a>
        </div>
      </main>
    </div>
  );
}
