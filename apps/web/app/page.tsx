import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { InstallBlock } from "../components/InstallBlock";
import { Wordmark } from "../components/ui/Wordmark.js";
import { AUTH_GITHUB_START, getTrending } from "../lib/api";
import { getSession } from "../lib/auth";
import { t } from "../lib/i18n";
import { getServerLocale } from "../lib/server-locale";
import { TrendingClient } from "./trending/Client";

export const runtime = "edge";

type Range = "today" | "7d" | "30d";

function validateRange(raw: string | undefined): Range {
  if (raw === "today" || raw === "30d") return raw;
  return "7d";
}

/**
 * Only accept ref codes that match the API's referral-code shape so we never
 * forward arbitrary attacker-controlled strings into the OAuth start URL.
 */
function pickRef(raw: string | string[] | undefined): string | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (typeof v !== "string") return null;
  return /^[A-Za-z0-9_-]{6,32}$/.test(v) ? v : null;
}

/** Match the API's `sanitizeUtm` charset/length so we don't ship junk. */
function pickUtm(raw: string | string[] | undefined): string | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (typeof v !== "string") return null;
  const trimmed = v.trim().toLowerCase().slice(0, 40);
  return /^[a-z0-9._-]+$/.test(trimmed) ? trimmed : null;
}

function buildStartUrl(params: {
  ref: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
}): string {
  const qs = new URLSearchParams();
  if (params.ref) qs.set("ref", params.ref);
  if (params.utmSource) qs.set("utm_source", params.utmSource);
  if (params.utmMedium) qs.set("utm_medium", params.utmMedium);
  if (params.utmCampaign) qs.set("utm_campaign", params.utmCampaign);
  const q = qs.toString();
  return q ? `${AUTH_GITHUB_START}?${q}` : AUTH_GITHUB_START;
}

export const metadata: Metadata = {
  title: "Token Rats — today's top burners",
  description:
    "Live leaderboard of public token burners on Claude Code and Cursor. Auto-sync, then flex.",
  openGraph: {
    title: "Token Rats — today's top burners",
    description: "Live global leaderboard of who's burning the most AI tokens.",
    images: [
      {
        url: "/cards/trending/7d",
        width: 1200,
        height: 630,
        alt: "Token Rats — top public token burners",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Token Rats — today's top burners",
    description: "Live global leaderboard of who's burning the most AI tokens.",
    images: ["/cards/trending/7d"],
  },
};

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{
    ref?: string | string[];
    range?: string | string[];
    utm_source?: string | string[];
    utm_medium?: string | string[];
    utm_campaign?: string | string[];
  }>;
}) {
  const user = await getSession();
  if (user) redirect("/app");

  const locale = await getServerLocale();
  const params = await searchParams;
  const ref = pickRef(params.ref);
  const startUrl = buildStartUrl({
    ref,
    utmSource: pickUtm(params.utm_source),
    utmMedium: pickUtm(params.utm_medium),
    utmCampaign: pickUtm(params.utm_campaign),
  });
  const range = validateRange(Array.isArray(params.range) ? params.range[0] : params.range);

  let rows: Awaited<ReturnType<typeof getTrending>>["rows"] = [];
  let generatedAt = Date.now();
  try {
    const data = await getTrending(range);
    rows = data.rows;
    generatedAt = data.generatedAt;
  } catch {
    // Empty board on error — better than crashing the homepage.
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Hero — one decision. Install snippet lives below in How it works. */}
      <section className="border-b border-zinc-800 bg-zinc-900/40">
        <div className="mx-auto max-w-3xl px-6 py-14 flex flex-col items-center text-center gap-6">
          <Wordmark size="xl" />
          <p className="max-w-md text-base text-zinc-300 sm:text-lg">
            {t(locale, "landing.tagline")}
          </p>
          <a
            href={startUrl}
            className="inline-flex items-center gap-2 rounded-xl bg-rat-500 px-6 py-3 text-base font-bold text-white shadow-lg shadow-rat-900/50 transition-colors hover:bg-rat-600 active:bg-rat-700"
          >
            <GitHubIcon />
            {t(locale, "landing.signin")}
          </a>
          <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-zinc-500">
            <span aria-hidden>🔒</span>
            <span>{t(locale, "privacy.short")}</span>
            <a
              href="https://github.com/hsalberti/token-rats"
              target="_blank"
              rel="noopener noreferrer"
              className="text-rat-400 hover:text-rat-300"
            >
              {t(locale, "privacy.verifyShort")}
            </a>
          </p>
        </div>
      </section>

      {/* Live trending board */}
      <main className="mx-auto max-w-3xl px-6 py-12">
        <div className="mb-6">
          <h2 className="text-2xl font-black tracking-tight">{t(locale, "landing.boardTitle")}</h2>
          <p className="mt-1 text-sm text-zinc-400">{t(locale, "landing.boardSub")}</p>
        </div>
        <TrendingClient initialRows={rows} initialRange={range} generatedAt={generatedAt} />
      </main>

      {/* How it works — install snippet lives in step 01. */}
      <section className="border-y border-zinc-800 bg-zinc-900/50 py-16">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="mb-10 text-center text-2xl font-black tracking-tight">
            {t(locale, "landing.howItWorks")}
          </h2>
          <div className="grid gap-8 sm:grid-cols-3">
            <Step
              number="01"
              title={t(locale, "landing.step1.title")}
              description={t(locale, "landing.step1.desc")}
            >
              <div className="mt-4">
                <InstallBlock locale={locale} />
              </div>
            </Step>
            <Step
              number="02"
              title={t(locale, "landing.step2.title")}
              description={t(locale, "landing.step2.desc")}
            />
            <Step
              number="03"
              title={t(locale, "landing.step3.title")}
              description={t(locale, "landing.step3.desc")}
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function Step({
  number,
  title,
  description,
  children,
}: {
  number: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="text-4xl font-black text-rat-700">{number}</div>
      <h3 className="text-xl font-bold">{title}</h3>
      <p className="text-zinc-400">{description}</p>
      {children}
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
