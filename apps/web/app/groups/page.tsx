/**
 * /groups — public country-locked rooms in the viewer's country.
 *
 * Auth optional. The API drives the country detection via cf-ipcountry;
 * we render whatever the API returns. Signed-out viewers see the same
 * list but with the join button swapped for a sign-in CTA.
 */
import type { Metadata } from "next";
import { ApiError, getGroups } from "../../lib/api";
import { getCookieHeader, getSession } from "../../lib/auth";

export const runtime = "edge";

export const metadata: Metadata = {
  title: "Public groups",
};

function flagFor(cc: string): string {
  return cc
    .toUpperCase()
    .split("")
    .map((c) => String.fromCodePoint(127397 + c.charCodeAt(0)))
    .join("");
}

function countryLabel(cc: string): string {
  try {
    const names = new Intl.DisplayNames(["en"], { type: "region" });
    return names.of(cc) ?? cc;
  } catch {
    return cc;
  }
}

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

export default async function GroupsPage() {
  const cookieHeader = await getCookieHeader();
  const session = await getSession();

  let country: string | null = null;
  let groups: Awaited<ReturnType<typeof getGroups>>["groups"] = [];
  try {
    const res = await getGroups(cookieHeader);
    country = res.country;
    groups = res.groups;
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;
    // Render the empty-country state on transient errors too.
  }

  const flagLabel = country ? `${flagFor(country)} ${countryLabel(country)}` : null;

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <a href="/" className="text-sm text-zinc-500 hover:text-zinc-300">
            ← Home
          </a>
          <a href="/" className="text-lg font-black tracking-tight">
            Token <span className="text-rat-500">Rats</span>
          </a>
          <div className="w-16" />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12 space-y-6">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Public groups</h1>
          {country ? (
            <p className="mt-1 text-zinc-400">
              Country-locked rooms open to anyone in {flagLabel}.
            </p>
          ) : (
            <p className="mt-1 text-zinc-400">
              We couldn't detect your country. Public groups are locked to the country Cloudflare
              resolves for your request — try a different network or VPN region.
            </p>
          )}
        </div>

        {country && groups.length === 0 && (
          <div className="rounded-xl border border-dashed border-zinc-700 px-8 py-16 text-center">
            <p className="text-4xl">🌍</p>
            <p className="mt-3 text-lg font-bold text-zinc-300">No public rooms yet</p>
            <p className="mt-1 text-sm text-zinc-500">
              Be the first to start one — create a new room and check "make public" on the
              dashboard.
            </p>
          </div>
        )}

        <ul className="space-y-3">
          {groups.map((g) => (
            <li
              key={g.code}
              className="rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-4 flex flex-wrap items-center gap-4"
            >
              <div className="flex-1 min-w-0">
                <a href={`/r/${g.code}`} className="font-bold text-zinc-100 hover:text-rat-400">
                  {g.name}
                </a>
                <p className="mt-0.5 font-mono text-xs text-zinc-500">
                  {g.code} · {g.memberCount} member{g.memberCount === 1 ? "" : "s"} ·{" "}
                  {fmtTokens(g.total30dTokens)} tokens · {fmtCost(g.total30dCostUsdCents)} (30d)
                </p>
              </div>
              {session ? (
                <a
                  href={`/r/${g.code}`}
                  className="rounded-lg bg-rat-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rat-600 transition-colors"
                >
                  Open
                </a>
              ) : (
                <a
                  href={`/signin?next=${encodeURIComponent(`/r/${g.code}`)}`}
                  className="rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-700 transition-colors"
                >
                  Sign in to join
                </a>
              )}
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
