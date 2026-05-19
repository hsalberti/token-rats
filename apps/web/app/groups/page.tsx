/**
 * v1.2 Track AE — `/groups` landing page.
 *
 * Server component. The Worker reads `cf-ipcountry` from the *Worker's*
 * incoming request and decides what to return — so from the user's POV the
 * list automatically scopes to wherever they're connecting from.
 *
 * If the viewer's country can't be resolved (corporate VPN, missing header
 * in local dev) we render an honest empty state. Each row links to a Join
 * action; mismatched-country 403s surface inline.
 */

import type { Metadata } from "next";
import { Card } from "../../components/ui/Card";
import { api } from "../../lib/api";
import { getCookieHeader } from "../../lib/auth";
import { countryMeta } from "./CountryMeta";
import { JoinGroupButton } from "./JoinGroupButton";

export const runtime = "edge";

export const metadata: Metadata = {
  title: "Public groups",
  description: "Find public Token Rats rooms in your country.",
};

export default async function GroupsPage() {
  const cookieHeader = await getCookieHeader();
  const data = await api.getGroups(cookieHeader);
  const viewer = data.viewerCountry ? countryMeta(data.viewerCountry) : null;

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <a href="/app" className="text-sm text-zinc-500 hover:text-zinc-300">
            Dashboard
          </a>
          <a href="/" className="text-lg font-black tracking-tight">
            Token <span className="text-rat-500">Rats</span>
          </a>
          <div className="w-20" />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-black tracking-tight">
            {viewer ? (
              <>
                Public groups in{" "}
                <span className="text-rat-400">
                  {viewer.emoji} {viewer.name}
                </span>
              </>
            ) : (
              "Public groups"
            )}
          </h1>
          {viewer && (
            <p className="mt-1 text-sm text-zinc-400">
              Visible only to people in {viewer.name}. Country-locked via your connection (no signup
              needed).
            </p>
          )}
        </div>

        {!viewer ? (
          <Card>
            <p className="text-zinc-300">
              We couldn&apos;t figure out your country. Are you on a corporate VPN?
            </p>
            <p className="mt-2 text-sm text-zinc-500">
              Disable the VPN (or whitelist <code>tokenrats.com</code>) and reload to see the groups
              in your country.
            </p>
          </Card>
        ) : data.groups.length === 0 ? (
          <Card>
            <p className="text-zinc-300">
              No public rooms in {viewer.name} yet. Be the first — create a room and tick &quot;make
              this public&quot; to seed the list.
            </p>
          </Card>
        ) : (
          <ul className="space-y-2">
            {data.groups.map((group) => {
              const code = group.code;
              return (
                <li
                  key={code}
                  className="flex items-center justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3"
                >
                  <a href={`/r/${code}`} className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-zinc-100 hover:text-rat-400">
                      {group.name}
                    </p>
                    <p className="font-mono text-xs text-zinc-500">
                      {code} · {group.memberCount} {group.memberCount === 1 ? "member" : "members"}
                    </p>
                  </a>
                  <JoinGroupButton
                    code={code}
                    viewerCountry={data.viewerCountry ?? group.country}
                    roomCountry={group.country}
                  />
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-8 text-center text-xs text-zinc-500">
          Travelling? You&apos;ll see different groups from a different country.
        </p>
      </main>
    </div>
  );
}
