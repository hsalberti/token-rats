import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Wordmark } from "../../components/ui/Wordmark.js";
import { AUTH_GITHUB_START } from "../../lib/api";
import { getSession } from "../../lib/auth";
import { t } from "../../lib/i18n";
import { getServerLocale } from "../../lib/server-locale";

export const runtime = "edge";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to Token Rats with GitHub.",
};

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

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{
    ref?: string | string[];
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1>
            <Wordmark size="lg" />
          </h1>
          <p className="mt-2 text-zinc-400">{t(locale, "signin.tagline")}</p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
          <div className="p-8">
            <h2 className="mb-2 text-xl font-bold">{t(locale, "signin.title")}</h2>
            <p className="mb-6 text-sm text-zinc-400">{t(locale, "signin.sub")}</p>

            <a
              href={startUrl}
              className="flex w-full items-center justify-center gap-3 rounded-xl bg-zinc-100 px-6 py-3.5 text-base font-bold text-zinc-900 transition-colors hover:bg-white active:bg-zinc-200"
            >
              <GitHubIcon />
              {t(locale, "landing.signin")}
            </a>
          </div>

          <div className="border-t border-zinc-800 px-8 py-4">
            <p className="text-center text-xs text-zinc-600">{t(locale, "signin.privacy")}</p>
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-zinc-600">
          {t(locale, "signin.noAccount")}{" "}
          <a href={startUrl} className="text-rat-400 hover:text-rat-300">
            {t(locale, "signin.noAccountCta")}
          </a>
        </p>
      </div>
    </div>
  );
}

function GitHubIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0 0 22 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}
