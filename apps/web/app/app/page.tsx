import type { Metadata } from "next";
import { headers } from "next/headers";
import { PrivacyFooter } from "../../components/PrivacyFooter";
import { UserMenu } from "../../components/UserMenu";
import { Wordmark } from "../../components/ui/Wordmark.js";
import { getCookieHeader, requireSession } from "../../lib/auth";
import { getServerLocale } from "../../lib/server-locale";
import { DashboardClient } from "./DashboardClient";

export const runtime = "edge";

export const metadata: Metadata = {
  title: "Dashboard",
};

/** Best-effort viewer country. Same normalization as the Worker. */
function viewerCountry(raw: string | null): string | null {
  if (!raw) return null;
  const v = raw.trim().toUpperCase();
  if (v.length !== 2 || v === "XX" || v === "T1") return null;
  return v;
}

const countryFlag = (cc: string): string =>
  cc
    .toUpperCase()
    .split("")
    .map((c) => String.fromCodePoint(127397 + c.charCodeAt(0)))
    .join("");

/**
 * Compute `${flag} ${countryName}` server-side. `Intl.DisplayNames` is
 * allowed on both sides, but the Cloudflare Worker's ICU may resolve a
 * given locale differently from the browser's — we saw a hydration crash
 * on the dashboard right after sign-in (React #418). Hoisting this here
 * keeps SSR and CSR rendering byte-identical for the country chip.
 */
function viewerCountryDisplay(cc: string | null, locale: string): string | null {
  if (!cc) return null;
  let name = cc;
  try {
    name = new Intl.DisplayNames([locale], { type: "region" }).of(cc) ?? cc;
  } catch {
    // Fall back to the bare code — same as the client would have done.
  }
  return `${countryFlag(cc)} ${name}`;
}

export default async function AppPage() {
  const user = await requireSession();
  const cookieHeader = await getCookieHeader();
  const h = await headers();
  const country = viewerCountry(h.get("cf-ipcountry"));
  const locale = await getServerLocale();
  const countryDisplay = viewerCountryDisplay(country, locale);

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Top bar */}
      <header className="relative z-40 border-b border-zinc-800 bg-zinc-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <a href="/">
            <Wordmark size="md" />
          </a>
          <UserMenu user={user} locale={locale} />
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        <DashboardClient
          user={user}
          cookieHeader={cookieHeader}
          viewerCountry={country}
          viewerCountryDisplay={countryDisplay}
          locale={locale}
        />
      </main>
      <PrivacyFooter />
    </div>
  );
}
