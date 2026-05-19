import { redirect } from "next/navigation";
import { InstallBlock } from "../components/InstallBlock";
import { Avatar } from "../components/ui/Avatar";
import { RankBadge } from "../components/ui/RankBadge";
import { AUTH_GITHUB_START } from "../lib/api";
import { getSession } from "../lib/auth";

export const runtime = "edge";

const MOCK_LEADERBOARD = [
  { rank: 1, handle: "theo", avatarUrl: null, tokens: 48_320_000, costUsdCents: 24160 },
  { rank: 2, handle: "rauchg", avatarUrl: null, tokens: 31_100_000, costUsdCents: 15550 },
  { rank: 3, handle: "shadcn", avatarUrl: null, tokens: 22_450_000, costUsdCents: 11225 },
  { rank: 4, handle: "karpathy", avatarUrl: null, tokens: 18_900_000, costUsdCents: 9450 },
  { rank: 5, handle: "levelsio", avatarUrl: null, tokens: 14_700_000, costUsdCents: 7350 },
];

function fmtTokens(n: number) {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return `${n}`;
}

function fmtCost(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default async function HomePage() {
  const user = await getSession();
  if (user) redirect("/app");

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Nav */}
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <span className="text-xl font-black tracking-tight">
          Token <span className="text-rat-500">Rats</span>
        </span>
        <a
          href={AUTH_GITHUB_START}
          className="rounded-lg bg-rat-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rat-600 active:bg-rat-700"
        >
          Sign in with GitHub
        </a>
      </nav>

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-6 pb-20 pt-16 text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-rat-700 bg-rat-900/30 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-rat-400">
          Now in beta
        </div>
        <h1 className="mb-6 text-5xl font-black tracking-tight sm:text-7xl">
          Token <span className="text-rat-500">Rats</span>
        </h1>
        <p className="mx-auto mb-4 max-w-xl text-xl text-zinc-300 sm:text-2xl">
          Strava for AI token burn.
        </p>
        <p className="mx-auto mb-10 max-w-lg text-base text-zinc-400">
          Auto-sync your Claude Code and Cursor token usage. See how you stack up against your crew.
          Flex the burn.
        </p>

        <div className="mx-auto mb-8 max-w-md">
          <InstallBlock />
        </div>

        <a
          href={AUTH_GITHUB_START}
          className="inline-flex items-center gap-2 rounded-xl bg-rat-500 px-8 py-4 text-lg font-bold text-white shadow-lg shadow-rat-900/50 transition-colors hover:bg-rat-600 active:bg-rat-700"
        >
          <GitHubIcon />
          Sign in with GitHub
        </a>
        <p className="mt-3 text-sm text-zinc-500">Free forever for individuals.</p>
      </section>

      {/* How it works */}
      <section className="border-y border-zinc-800 bg-zinc-900/50 py-20">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="mb-12 text-center text-3xl font-black tracking-tight">How it works</h2>
          <div className="grid gap-8 sm:grid-cols-3">
            <Step
              number="01"
              title="Install"
              description="One command to connect your Claude Code and Cursor logs. Runs locally — no prompt content leaves your machine."
            />
            <Step
              number="02"
              title="Sync"
              description="Run npx token-rats sync whenever you want. Or set up a cron. Your daily token counts upload in seconds."
            />
            <Step
              number="03"
              title="Flex"
              description="See your rank in every room. Share your card. Watch your crew react. Tokenmaxxing is now a sport."
            />
          </div>
        </div>
      </section>

      {/* Sample leaderboard */}
      <section className="mx-auto max-w-5xl px-6 py-20">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-black tracking-tight">Sample leaderboard</h2>
            <p className="mt-1 text-sm text-zinc-400">
              This week&apos;s burn — your room could look like this.
            </p>
          </div>
          <span className="rounded-lg border border-rat-700 bg-rat-900/30 px-3 py-1 text-xs font-semibold text-rat-400">
            7d
          </span>
        </div>

        <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
          {/* Table header — hidden on mobile */}
          <div className="hidden grid-cols-[48px_1fr_140px_120px_80px] border-b border-zinc-800 px-4 py-3 text-xs font-semibold uppercase tracking-widest text-zinc-500 sm:grid">
            <span>#</span>
            <span>Developer</span>
            <span className="text-right">Tokens</span>
            <span className="text-right">$ Spent</span>
            <span className="text-right">Sessions</span>
          </div>
          {MOCK_LEADERBOARD.map((row) => (
            <div
              key={row.handle}
              className="flex items-center gap-3 border-b border-zinc-800 px-4 py-4 last:border-0 sm:grid sm:grid-cols-[48px_1fr_140px_120px_80px] sm:items-center"
            >
              <RankBadge rank={row.rank} />
              <div className="flex items-center gap-3">
                <Avatar src={row.avatarUrl} handle={row.handle} size="sm" />
                <span className="font-semibold">@{row.handle}</span>
              </div>
              <div className="ml-auto flex flex-col items-end gap-0.5 sm:contents">
                <span className="text-right font-mono font-bold text-rat-400 sm:block">
                  {fmtTokens(row.tokens)}
                </span>
                <span className="text-right font-mono text-sm text-zinc-400 sm:block">
                  {fmtCost(row.costUsdCents)}
                </span>
                <span className="hidden text-right font-mono text-sm text-zinc-500 sm:block">
                  —
                </span>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-center text-sm text-zinc-600">(Sample data — yours will be real)</p>
      </section>

      {/* Privacy strip */}
      <section className="border-t border-zinc-800 bg-zinc-900/30 py-12">
        <div className="mx-auto max-w-2xl px-6 text-center">
          <p className="text-2xl font-black">We literally can&apos;t read your prompts.</p>
          <p className="mt-3 text-zinc-400">
            Token Rats counts only — we parse token numbers from your local logs, never the content.
            The CLI is open source so you can verify it before trusting it.
          </p>
          <a
            href="https://github.com/hsalberti/token-rats"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-2 text-sm text-rat-400 hover:text-rat-300"
          >
            <GitHubIcon className="h-4 w-4" />
            View source on GitHub
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-800 px-6 py-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 sm:flex-row sm:justify-between">
          <span className="font-black">
            Token <span className="text-rat-500">Rats</span>
          </span>
          <div className="flex items-center gap-6 text-sm text-zinc-500">
            <a
              href="https://github.com/hsalberti/token-rats"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-zinc-300"
            >
              GitHub
            </a>
            <a
              href="https://github.com/hsalberti/token-rats/blob/main/mission.md"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-zinc-300"
            >
              Mission
            </a>
            <a
              href="https://twitter.com/hsalberti"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-zinc-300"
            >
              made by @hsalberti
            </a>
            <span>Counts only — we can&apos;t read your prompts.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Step({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="text-4xl font-black text-rat-700">{number}</div>
      <h3 className="text-xl font-bold">{title}</h3>
      <p className="text-zinc-400">{description}</p>
    </div>
  );
}

function GitHubIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0 0 22 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}
