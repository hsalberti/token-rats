import type { Metadata } from "next";
import { Wordmark } from "../../components/ui/Wordmark.js";

export const runtime = "edge";

export const metadata: Metadata = {
  title: "Patch Notes — Token Rats",
  description: "What changed in Token Rats. New features, hardening, and what's coming next.",
};

type ItemTone = "new" | "improved" | "fixed" | "security";

interface PatchItem {
  title: string;
  body: string;
  tone?: ItemTone;
}

interface PatchSection {
  heading: string;
  items: PatchItem[];
}

interface Patch {
  version: string;
  codename: string;
  date: string;
  blurb?: string;
  sections: PatchSection[];
}

const PATCHES: Patch[] = [
  {
    version: "1.2",
    codename: "Launch Surface",
    date: "2026-05-19",
    blurb:
      "The last mile before strangers arrive. Share, refer, delete, install — all of it cleaner.",
    sections: [
      {
        heading: "New",
        items: [
          {
            tone: "new",
            title: "Wordle-style room recap",
            body: "The room Share button now spits out a copy-paste recap with the [TR🔶🐭] brand mark. Built to land on an X timeline and bring a stranger back through the install link.",
          },
          {
            tone: "new",
            title: "Affiliate / referral links",
            body: "Every signup carries a ref code through the GitHub OAuth handoff. We finally know who brought who.",
          },
          {
            tone: "new",
            title: "Delete room",
            body: "Owners can delete their rooms. We know — it took a minute.",
          },
          {
            tone: "new",
            title: "Node install hint",
            body: "If you don't have npx, the install block says so and points at nvm instead of failing in silence.",
          },
        ],
      },
      {
        heading: "Improvements",
        items: [
          {
            tone: "improved",
            title: "Cursor v0.0.4",
            body: "CLI now reads aiService.generations straight from the Cursor workspace SQLite and estimates token counts when Cursor doesn't surface them directly.",
          },
          {
            tone: "improved",
            title: "sql.js Cursor reader",
            body: "Dropped better-sqlite3 in favor of sql.js. The CLI no longer needs a native build step — it installs cleanly on every Node version we test.",
          },
          {
            tone: "improved",
            title: "Cross-subdomain session cookie",
            body: "Web and api.* on the same apex finally share the session. Sign in once, stay signed in.",
          },
          {
            tone: "improved",
            title: "Auto-redirect logged-in users",
            body: "Hit / or /signin while already logged in? You go straight to /app. No more bounce.",
          },
        ],
      },
      {
        heading: "Fixes",
        items: [
          {
            tone: "fixed",
            title: "Number formatting",
            body: "Big numbers now use B for billions and en-US thousands separators everywhere. No more raw scientific-looking integers in your face.",
          },
          {
            tone: "fixed",
            title: "Biome lint baseline",
            body: "pnpm lint is green from a clean checkout. CI no longer lies about the warning count.",
          },
        ],
      },
    ],
  },
  {
    version: "1.1",
    codename: "Sharpen the Edge",
    date: "2026-05-18",
    blurb:
      "One viral feature, a stack of hardening, and the boring stuff that has to work when a stranger installs the CLI.",
    sections: [
      {
        heading: "New",
        items: [
          {
            tone: "new",
            title: "Codex is a first-class source",
            body: "Parser, pricing, CLI sync. If you use Codex, your sessions count alongside Claude Code and Cursor.",
          },
          {
            tone: "new",
            title: "Add-a-source picker",
            body: "Your dashboard now has a three-option entry: Claude Code · Codex · Other. The Other branch breaks down into IDE / API / Open Source so you can find your tool fast.",
          },
          {
            tone: "new",
            title: "Per-source profile tiles",
            body: "/u/[handle] now breaks your spend down by source instead of one giant number. See where your tokens actually go.",
          },
          {
            tone: "new",
            title: "Top-2 source badges on leaderboards",
            body: "Each row shows which two tools dominate that person's stack. Quick read on who's a Claude main vs a Cursor main vs a Codex sleeper.",
          },
          {
            tone: "new",
            title: "364-day profile heatmap",
            body: "GitHub-style contribution grid on every public profile. Watch your streak fill in and your cold weeks haunt you.",
          },
          {
            tone: "new",
            title: "API proxy mode",
            body: "Point your Anthropic SDK at api.tokenrats.com/v1/proxy/anthropic and we'll auto-log your usage. We never read prompts. Keys are AES-256-GCM encrypted at rest and never returned through the API, even to you.",
          },
          {
            tone: "new",
            title: "tokenrats.com is the home address",
            body: ".dev is retired. .com is the only domain we promise to maintain.",
          },
        ],
      },
      {
        heading: "Improvements",
        items: [
          {
            tone: "improved",
            title: "Claude Code token accuracy",
            body: "We were double-counting cache tokens and undercounting subagents. Cache tokens are now excluded from your totals and subagent calls roll into the parent session. Your numbers got more honest.",
          },
          {
            tone: "improved",
            title: "Live leaderboard fan-out",
            body: "Cache invalidates on every ingest; Durable Object messages batch instead of firing one per row. Rooms feel real-time again.",
          },
          {
            tone: "improved",
            title: "Per-isolate proxy key cache",
            body: "Decrypted Anthropic keys cache inside each Worker isolate. Proxy requests stop hitting D1 on the hot path.",
          },
          {
            tone: "improved",
            title: "KV-cached profile reads",
            body: "Profile, autobiography, and streak reads are now served from KV. Cold loads got noticeably faster.",
          },
          {
            tone: "improved",
            title: "OG cards fail loud",
            body: "When the API behind a share card breaks, the route returns 500 instead of silently rendering a blank PNG. We'd rather see a broken card than ship a confusing one.",
          },
          {
            tone: "improved",
            title: "Honest /v1/push/test",
            body: "The push-test endpoint now tells you it's a stub until real RFC 8291 payload encryption lands. No more pretending.",
          },
        ],
      },
      {
        heading: "Security & trust",
        items: [
          {
            tone: "security",
            title: "Baseline security headers",
            body: "CSP, X-Frame-Options, X-Content-Type-Options, and friends on every worker response.",
          },
          {
            tone: "security",
            title: "Idempotent Stripe webhook",
            body: "Replays don't double-charge anyone or create ghost subscriptions.",
          },
          {
            tone: "security",
            title: "Pinned OAuth redirect_uri",
            body: "GitHub OAuth redirect_uri is locked to API_ORIGIN. No open-redirect tricks from forged callbacks.",
          },
          {
            tone: "security",
            title: "Production-only CORS scope",
            body: "localhost-allowed CORS is now gated to non-production builds. Production only trusts the real origin.",
          },
          {
            tone: "security",
            title: "Owner-gated org spend",
            body: "/v1/orgs/:id/spend-by-user is now owner/admin-only. Regular members don't see each other's totals.",
          },
          {
            tone: "security",
            title: "Validated handles",
            body: "Display handles and twitter handles get a real shape check before they hit the database.",
          },
        ],
      },
      {
        heading: "Fixes",
        items: [
          {
            tone: "fixed",
            title: "Settings pages surface failures",
            body: "If a settings load fails, you see the error. We stopped defaulting to a fake empty state.",
          },
          {
            tone: "fixed",
            title: "Abuse + proxy errors no longer silent",
            body: "If something breaks in the abuse or proxy paths, the response says so. No more shrugging.",
          },
          {
            tone: "fixed",
            title: "Weekly digest cron paused",
            body: "Cron stays off until the real email provider is wired. We won't promise email we can't actually send.",
          },
        ],
      },
    ],
  },
  {
    version: "1.0",
    codename: "Launch Build",
    date: "2026-05-17",
    blurb: "The bones of the game. Four phases, one bet: counts only — we never read your prompts.",
    sections: [
      {
        heading: "Phase 0 — Foundation",
        items: [
          {
            tone: "new",
            title: "Monorepo + locked contracts",
            body: "pnpm workspaces + Turbo + Biome. The contracts package holds every API shape as a Zod schema — change a contract, the whole monorepo's typechecker tells you what else needs to move.",
          },
          {
            tone: "new",
            title: "Centralized pricing",
            body: "One pricing table for every model we support, with date-suffix fallback so a new dated model ID doesn't break price math.",
          },
        ],
      },
      {
        heading: "Phase 1 — Pipeline end-to-end",
        items: [
          {
            tone: "new",
            title: "Token Rats CLI",
            body: "login, sync, watch, whoami, logout. Reads Claude Code + Cursor logs from disk and uploads counts only — prompt content never leaves your machine.",
          },
          {
            tone: "new",
            title: "Cloudflare Worker API",
            body: "Hono on the edge under /v1/*. D1 for storage, KV for cache, R2 for share cards, Durable Objects for live rooms.",
          },
          {
            tone: "new",
            title: "First web surfaces",
            body: "Share cards, /cli device-code approval, /join, public profile pages.",
          },
        ],
      },
      {
        heading: "Phase 2 — The game layer",
        items: [
          {
            tone: "new",
            title: "Rooms",
            body: "Create one, share the code, see your crew on a leaderboard. Range selector for today / 7d / 30d / all.",
          },
          {
            tone: "new",
            title: "Streaks + challenges",
            body: "Daily streak counter, weekly challenges, the small game-loop hooks.",
          },
          {
            tone: "new",
            title: "Autobiography reveal",
            body: "After your first sync, /onboarding shows you what your last 30 days actually look like. Most people learn something.",
          },
          {
            tone: "new",
            title: "Share cards v2",
            body: "Per-user weekly card, per-room card, trending card — all at 1200×630, all cached in R2.",
          },
        ],
      },
      {
        heading: "Phase 3 — Realtime + trust",
        items: [
          {
            tone: "new",
            title: "Live rooms via SSE",
            body: "RoomLiveHub Durable Object fans leaderboard updates to every open tab. No refresh needed.",
          },
          {
            tone: "new",
            title: "Public profiles",
            body: "/u/[handle] is opt-in. Privacy toggle lives on /settings/profile. Default is private.",
          },
          {
            tone: "new",
            title: "Trending page",
            body: "/trending shows the global movers across every public room. Today / 7d / 30d.",
          },
          {
            tone: "new",
            title: "Org plan scaffold",
            body: "Routes, Stripe webhook, org members + roles. Hidden in 1.1 pending consumer pull, but the schema stays.",
          },
        ],
      },
    ],
  },
];

const COMING_SOON: PatchItem[] = [
  {
    title: "Head-to-head cards",
    body: "/r/[code]/vs/[a]/[b] — paired stats, a giant delta number, and a card you can paste straight into a reply. Settle it.",
  },
  {
    title: "Real web push payloads",
    body: "RFC 8291 encryption so push notifications actually land with a title and a body on Chrome desktop and Android.",
  },
  {
    title: "Real email digests",
    body: "users.email column + Resend integration. Monday-morning recap, one unsubscribe link, no marketing nonsense.",
  },
  {
    title: "Group heatmap + group streak",
    body: "Room-scoped contribution grid and an all-members-active streak pill on every room page.",
  },
  {
    title: "Primary-source pill",
    body: "A claude-max / codex-pro / cursor-ide chip next to your handle everywhere, derived from your last 30 days.",
  },
  {
    title: "Coverage waitlists",
    body: "Companies waitlist for the org plan. Provider waitlists for the tools we don't track yet. Zero engineering on the feature, real signal on what to revive first.",
  },
];

function toneStyles(tone: ItemTone | undefined): { label: string; classes: string } {
  switch (tone) {
    case "new":
      return {
        label: "NEW",
        classes: "border-rat-700 bg-rat-900/30 text-rat-400",
      };
    case "improved":
      return {
        label: "IMPROVED",
        classes: "border-sky-800 bg-sky-950/40 text-sky-300",
      };
    case "fixed":
      return {
        label: "FIXED",
        classes: "border-emerald-800 bg-emerald-950/40 text-emerald-300",
      };
    case "security":
      return {
        label: "SECURITY",
        classes: "border-amber-800 bg-amber-950/30 text-amber-300",
      };
    default:
      return {
        label: "NOTE",
        classes: "border-zinc-700 bg-zinc-900 text-zinc-300",
      };
  }
}

export default function ChangelogPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <a href="/" className="text-sm text-zinc-500 hover:text-zinc-300">
            &larr; Home
          </a>
          <a href="/">
            <Wordmark size="md" />
          </a>
          <div className="w-16" />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        {/* Hero */}
        <section className="mb-14">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-rat-700 bg-rat-900/30 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-rat-400">
            Patch notes
          </div>
          <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
            What&apos;s new in <span className="text-rat-500">Token Rats</span>
          </h1>
          <p className="mt-4 max-w-xl text-zinc-400">
            We ship a lot of small things and a few big ones. Here&apos;s what changed and why.
            Counts only — we still can&apos;t read your prompts.
          </p>
        </section>

        {/* Patches */}
        <div className="space-y-20">
          {PATCHES.map((patch) => (
            <article key={patch.version} className="relative">
              <PatchHeader patch={patch} />
              <div className="mt-8 space-y-10">
                {patch.sections.map((section) => (
                  <section key={section.heading}>
                    <h3 className="mb-4 text-xs font-bold uppercase tracking-widest text-zinc-500">
                      {section.heading}
                    </h3>
                    <ul className="space-y-4">
                      {section.items.map((item) => (
                        <PatchItemRow key={item.title} item={item} />
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            </article>
          ))}
        </div>

        {/* Coming soon */}
        <section className="mt-20 rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
          <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Coming soon</h2>
          <p className="mt-2 text-sm text-zinc-400">
            What&apos;s queued for the next patch. Subject to change — we follow the signal.
          </p>
          <ul className="mt-6 space-y-4">
            {COMING_SOON.map((item) => (
              <li key={item.title} className="flex flex-col gap-1">
                <span className="font-semibold text-zinc-200">{item.title}</span>
                <span className="text-sm text-zinc-400">{item.body}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Footer note */}
        <p className="mt-16 text-center text-xs text-zinc-600">
          We don&apos;t list changes here that could compromise security. Hardening, owner-only
          tooling, and anything an attacker could use as a map ships quietly.
        </p>
        <p className="mt-3 text-center text-sm text-zinc-600">
          Spotted something we changed and didn&apos;t mention? Send us a message{" "}
          <a
            href="https://x.com/tokenratsx"
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-400 hover:text-zinc-200"
          >
            @tokenratsx
          </a>
          .
        </p>
      </main>
    </div>
  );
}

function PatchHeader({ patch }: { patch: Patch }) {
  return (
    <header className="border-b border-zinc-800 pb-6">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <span className="font-mono text-3xl font-black text-rat-500">v{patch.version}</span>
        <h2 className="text-3xl font-black tracking-tight">{patch.codename}</h2>
        <time className="ml-auto font-mono text-sm text-zinc-500">{patch.date}</time>
      </div>
      {patch.blurb ? <p className="mt-3 max-w-2xl text-zinc-400">{patch.blurb}</p> : null}
    </header>
  );
}

function PatchItemRow({ item }: { item: PatchItem }) {
  const { label, classes } = toneStyles(item.tone);
  return (
    <li className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
      <span
        className={`inline-flex h-5 shrink-0 items-center rounded border px-1.5 font-mono text-[10px] font-bold uppercase tracking-widest ${classes}`}
      >
        {label}
      </span>
      <div className="flex flex-col gap-1">
        <span className="font-semibold text-zinc-100">{item.title}</span>
        <span className="text-sm text-zinc-400">{item.body}</span>
      </div>
    </li>
  );
}
