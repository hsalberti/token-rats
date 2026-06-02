/**
 * /groups — country board for the viewer's `cf-ipcountry`.
 *
 * The "Brazil board" surface: a ranked list of every public user in the
 * viewer's country (driven by the `userBoard` field on /v1/groups), plus
 * the existing list of public rooms. When the country has no public users
 * yet, we pitch the viewer on flipping their profile public to be the first.
 *
 * Auth optional. Signed-out viewers see the same board; the CTA points at
 * /signin for them, and at /settings/profile for signed-in viewers.
 */
import type { Metadata } from "next";
import { CountryFlag, countryLabel } from "../../components/CountryFlag";
import { ApiError, getGroups } from "../../lib/api";
import { getCookieHeader, getSession } from "../../lib/auth";

export const runtime = "edge";

export const metadata: Metadata = {
  title: "Country board",
};

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
  let userBoard: Awaited<ReturnType<typeof getGroups>>["userBoard"] = [];
  try {
    const res = await getGroups(cookieHeader);
    country = res.country;
    groups = res.groups;
    userBoard = res.userBoard;
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;
    // Render the empty-country state on transient errors too.
  }

  const countryName = country ? countryLabel(country) : null;
  const viewerIsPublic = session?.publicProfile === true;
  // When signed-out, route through /signin so they land back on the settings
  // page after auth and can flip the toggle in one go.
  const goPublicHref = session
    ? "/settings/profile"
    : `/signin?next=${encodeURIComponent("/settings/profile")}`;

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

      <main className="mx-auto max-w-3xl px-6 py-12 space-y-10">
        <div>
          <h1 className="text-3xl font-black tracking-tight">
            {country && countryName ? (
              <span className="inline-flex items-center gap-3">
                <CountryFlag country={country} className="h-7 w-9 rounded-sm" />
                <span>{countryName} board</span>
              </span>
            ) : (
              "Country board"
            )}
          </h1>
          {country ? (
            <p className="mt-1 text-zinc-400">
              Public Token Rats in {countryName}, ranked by tokens burned in the last 30 days.
            </p>
          ) : (
            <p className="mt-1 text-zinc-400">
              We couldn't detect your country. The country board is locked to the country Cloudflare
              resolves for your request — try a different network or VPN region.
            </p>
          )}
        </div>

        {country && userBoard.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-zinc-200">
              <span className="inline-flex items-center gap-2">
                <CountryFlag country={country} className="h-5 w-6 rounded-[2px]" />
                <span>{countryName} leaderboard ({userBoard.length})</span>
              </span>
            </h2>
            <ol className="space-y-2">
              {userBoard.map((row) => (
                <li
                  key={row.userId}
                  className="rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-3 flex items-center gap-4"
                >
                  <span className="w-8 text-center font-mono text-sm text-zinc-500">
                    #{row.rank}
                  </span>
                  {row.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={row.avatarUrl}
                      alt=""
                      className="h-9 w-9 rounded-full border border-zinc-800"
                    />
                  ) : (
                    <div className="h-9 w-9 rounded-full bg-zinc-800" />
                  )}
                  <a
                    href={`/u/${row.handle}`}
                    className="flex-1 min-w-0 font-bold text-zinc-100 hover:text-rat-400 truncate"
                  >
                    @{row.handle}
                  </a>
                  <div className="text-right">
                    <p className="font-mono text-sm text-zinc-200">{fmtTokens(row.tokens)}</p>
                    <p className="font-mono text-xs text-zinc-500">{fmtCost(row.costUsdCents)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        {country && userBoard.length === 0 && (
          <section className="rounded-xl border border-dashed border-zinc-700 bg-zinc-900/50 px-8 py-12 text-center">
            <div className="flex justify-center">
              <CountryFlag country={country} className="h-12 w-16 rounded-md" />
            </div>
            <p className="mt-4 text-xl font-bold text-zinc-100">
              {viewerIsPublic
                ? `You're the first one on ${countryName}'s board.`
                : `Set your profile to public to be the first on ${countryName}'s board.`}
            </p>
            <p className="mt-2 text-sm text-zinc-400">
              {viewerIsPublic
                ? "Sync some tokens with the CLI and you'll show up here. Invite friends to climb past you."
                : "Public profiles appear on the country board and the global trending list. We never expose prompt content — just counts."}
            </p>

            {!viewerIsPublic && (
              <>
                <div className="mt-6 mx-auto max-w-md rounded-lg border border-zinc-800 bg-zinc-950/60 px-5 py-4 text-left text-sm text-zinc-300">
                  <p className="font-semibold text-zinc-200">How to go public</p>
                  <ol className="mt-2 space-y-1 list-decimal list-inside text-zinc-400">
                    <li>
                      Open{" "}
                      <a href="/settings/profile" className="text-rat-400 hover:underline">
                        Settings → Profile
                      </a>
                      .
                    </li>
                    <li>Toggle "Public profile" on.</li>
                    <li>Save. You'll show up on /trending and {countryName}'s board.</li>
                  </ol>
                </div>

                <a
                  href={goPublicHref}
                  className="mt-6 inline-block rounded-lg bg-rat-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-rat-600 transition-colors"
                >
                  {session ? "Go to profile settings" : "Sign in to go public"}
                </a>
              </>
            )}
          </section>
        )}

        {country && (
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-zinc-200">
              <span className="inline-flex items-center gap-2">
                <CountryFlag country={country} className="h-5 w-6 rounded-[2px]" />
                <span>
                  Public rooms in {countryName}
                  {groups.length > 0 ? ` (${groups.length})` : ""}
                </span>
              </span>
            </h2>
            {groups.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-800 px-6 py-8 text-center text-sm text-zinc-500">
                No public rooms yet — be the first to start one from the dashboard.
              </div>
            ) : (
              <ul className="space-y-3">
                {groups.map((g) => (
                  <li
                    key={g.code}
                    className="rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-4 flex flex-wrap items-center gap-4"
                  >
                    <div className="flex-1 min-w-0">
                      <a
                        href={`/r/${g.code}`}
                        className="font-bold text-zinc-100 hover:text-rat-400"
                      >
                        {g.name}
                      </a>
                      <p className="mt-0.5 font-mono text-xs text-zinc-500">
                        {g.code} · {g.memberCount} member{g.memberCount === 1 ? "" : "s"} ·{" "}
                        {fmtTokens(g.total30dTokens)} tokens · {fmtCost(g.total30dCostUsdCents)}{" "}
                        (30d)
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
            )}
          </section>
        )}
      </main>
    </div>
  );
}
