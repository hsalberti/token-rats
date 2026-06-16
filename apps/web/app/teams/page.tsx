import type { Metadata } from "next";
import { PrivacyFooter } from "../../components/PrivacyFooter";
import { Wordmark } from "../../components/ui/Wordmark.js";
import { AUTH_GITHUB_START } from "../../lib/api";
import { getSession } from "../../lib/auth";
import { t } from "../../lib/i18n";
import { getServerLocale } from "../../lib/server-locale";

export const runtime = "edge";

export const metadata: Metadata = {
  title: "Token Rats for IT teams",
  description:
    "We work with IT teams so enterprises can safely set up token usage competitions across teams. Privacy focused. Direct contact with founders.",
};

/** Same charset/length as the landing's referral-code shape (page.tsx:24-28). */
function pickRef(raw: string | string[] | undefined): string | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (typeof v !== "string") return null;
  return /^[A-Za-z0-9_-]{6,32}$/.test(v) ? v : null;
}

/** Match the API's sanitizeUtm charset/length so we don't ship junk. */
function pickUtm(raw: string | string[] | undefined): string | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (typeof v !== "string") return null;
  const trimmed = v.trim().toLowerCase().slice(0, 40);
  return /^[a-z0-9._-]+$/.test(trimmed) ? trimmed : null;
}

export default async function TeamsPage({
  searchParams,
}: {
  searchParams: Promise<{
    ref?: string | string[];
    utm_source?: string | string[];
    utm_medium?: string | string[];
    utm_campaign?: string | string[];
  }>;
}) {
  const locale = await getServerLocale();
  const user = await getSession();
  const params = await searchParams;
  const ref = pickRef(params.ref);
  const utmSource = pickUtm(params.utm_source);
  const utmMedium = pickUtm(params.utm_medium);
  const utmCampaign = pickUtm(params.utm_campaign);
  const qs = new URLSearchParams();
  if (ref) qs.set("ref", ref);
  if (utmSource) qs.set("utm_source", utmSource);
  if (utmMedium) qs.set("utm_medium", utmMedium);
  if (utmCampaign) qs.set("utm_campaign", utmCampaign);
  const q = qs.toString();
  const startUrl = q ? `${AUTH_GITHUB_START}?${q}` : AUTH_GITHUB_START;
  // The OAuth callback hardcodes /onboarding (new) or /app (returning) — see
  // apps/api/src/routes/auth.ts. There is no `next` mechanism, so signed-out
  // users land on the dashboard, where UserMenu → "Request an org" carries
  // them on to /o/new. Signed-in: straight to the form.
  const ctaHref = user ? "/o/new" : startUrl;
  const ctaLabel = user ? t(locale, "teams.cta.signedIn") : t(locale, "teams.cta.signedOut");

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <a href="/" className="text-sm text-zinc-500 hover:text-zinc-300">
            {t(locale, "teams.backHome")}
          </a>
          <a href="/">
            <Wordmark size="md" />
          </a>
          <div className="w-16" />
        </div>
      </header>

      <main className="flex-1">
        <section className="border-b border-zinc-800 bg-zinc-900/40">
          <div className="mx-auto max-w-3xl px-6 py-14 flex flex-col items-center text-center gap-6">
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
              {t(locale, "teams.title")}
            </h1>
            <p className="max-w-xl text-base text-zinc-300 sm:text-lg">{t(locale, "teams.sub")}</p>
            <a
              href={ctaHref}
              className="inline-flex items-center gap-2 rounded-xl bg-rat-500 px-6 py-3 text-base font-bold text-white shadow-lg shadow-rat-900/50 transition-colors hover:bg-rat-600 active:bg-rat-700"
            >
              {ctaLabel}
            </a>
            <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-zinc-500">
              <span aria-hidden>🔒</span>
              <span>{t(locale, "privacy.short")}</span>
              <a
                href="https://www.npmjs.com/package/token-rats"
                target="_blank"
                rel="noopener noreferrer"
                className="text-rat-400 hover:text-rat-300"
              >
                {t(locale, "privacy.verifyShort")}
              </a>
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-6 py-12">
          <div className="grid gap-6 sm:grid-cols-3">
            <Bullet
              title={t(locale, "teams.bullet1.title")}
              body={t(locale, "teams.bullet1.body")}
            />
            <Bullet
              title={t(locale, "teams.bullet2.title")}
              body={t(locale, "teams.bullet2.body")}
            />
            <Bullet
              title={t(locale, "teams.bullet3.title")}
              body={t(locale, "teams.bullet3.body")}
            />
          </div>
        </section>

        <section className="border-t border-zinc-800 bg-zinc-900/50 py-14">
          <div className="mx-auto max-w-3xl px-6 flex flex-col items-center text-center gap-5">
            <h2 className="text-2xl font-black tracking-tight">
              {t(locale, "teams.waitlistTitle")}
            </h2>
            <p className="max-w-xl text-base text-zinc-400">{t(locale, "teams.waitlistBody")}</p>
            <a
              href={ctaHref}
              className="inline-flex items-center gap-2 rounded-xl bg-rat-500 px-6 py-3 text-base font-bold text-white shadow-lg shadow-rat-900/50 transition-colors hover:bg-rat-600 active:bg-rat-700"
            >
              {ctaLabel}
            </a>
          </div>
        </section>
      </main>

      <PrivacyFooter />
    </div>
  );
}

function Bullet({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
      <h3 className="text-base font-bold tracking-tight text-zinc-100">{title}</h3>
      <p className="mt-2 text-sm text-zinc-400">{body}</p>
    </div>
  );
}
