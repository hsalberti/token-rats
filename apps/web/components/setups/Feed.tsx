"use client";
import type { SetupFeed } from "@token-rats/contracts";
import { useState } from "react";
import { socialRequest } from "../../lib/social";
import { SetupCard } from "./SetupCard";
export function Feed({ initial }: { initial: SetupFeed }) {
  const [data, setData] = useState(initial);
  const [mode, setMode] = useState("following");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [people, setPeople] = useState<{ id: string; handle: string; following: number }[]>([]);
  const [query, setQuery] = useState("");
  async function load(next: string, more = false) {
    setBusy(true);
    setError("");
    try {
      const res = await socialRequest<SetupFeed>(
        `setups/feed?mode=${next}${more && data.nextCursor ? `&cursor=${encodeURIComponent(data.nextCursor)}` : ""}`,
      );
      setMode(next);
      setData(more ? { ...res, versions: [...data.versions, ...res.versions] } : res);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function find() {
    try {
      setPeople(
        (
          await socialRequest<{ people: typeof people }>(
            `setups/people?q=${encodeURIComponent(query)}`,
          )
        ).people,
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function follow(handle: string, on: boolean) {
    try {
      await socialRequest(`setups/follow/${handle}`, { method: on ? "DELETE" : "PUT" });
      setPeople(people.map((p) => (p.handle === handle ? { ...p, following: on ? 0 : 1 } : p)));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_260px]">
      <section>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black">Your people, their setups.</h1>
            <p className="mt-2 text-sm text-zinc-400">What they kept, changed, and left behind.</p>
          </div>
          <a
            href="/setups/new"
            className="rounded-lg bg-rat-500 px-4 py-2 text-sm font-bold text-black"
          >
            Save a setup
          </a>
        </div>
        <div className="mb-5 flex gap-4 border-b border-zinc-800">
          {["following", "discover"].map((m) => (
            <button
              key={m}
              type="button"
              disabled={busy}
              onClick={() => load(m)}
              className={`pb-3 text-sm capitalize ${mode === m ? "border-b-2 border-rat-500 text-rat-400" : "text-zinc-400"}`}
            >
              {m}
            </button>
          ))}
        </div>
        {error && (
          <p role="alert" className="mb-4 text-red-400">
            {error}
          </p>
        )}
        <div className="space-y-5">
          {data.versions.map((v) => (
            <SetupCard key={v.id} version={v} />
          ))}
          {!data.versions.length && (
            <div className="rounded-xl border border-dashed border-zinc-700 p-8">
              <h2 className="text-lg font-semibold">Start with your own history.</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Save the instructions and tools you use today. Follow people to see their next
                shared setup here.
              </p>
              <button type="button" onClick={() => load("discover")} className="mt-4 text-rat-400">
                Discover shared setups →
              </button>
            </div>
          )}
        </div>
        {data.nextCursor && (
          <button
            type="button"
            disabled={busy}
            onClick={() => load(mode, true)}
            className="mt-6 text-rat-400"
          >
            {busy ? "Loading…" : "Load more"}
          </button>
        )}
      </section>
      <aside className="space-y-6">
        <div className="rounded-xl border border-zinc-800 p-5">
          <h2 className="font-semibold">Find your people</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              find();
            }}
            className="mt-3 flex gap-2"
          >
            <input
              aria-label="Search people"
              placeholder="GitHub handle"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="min-w-0 w-full rounded border border-zinc-700 bg-zinc-900 p-2 text-sm"
            />
            <button type="submit" className="text-sm text-rat-400">
              Find
            </button>
          </form>
          <div className="mt-3 space-y-3">
            {people.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 text-xs">
                <a href={`/u/${p.handle}`} className="truncate">
                  @{p.handle}
                </a>
                <button
                  type="button"
                  onClick={() => follow(p.handle, !!p.following)}
                  className="text-rat-400"
                >
                  {p.following ? "Following" : "Follow"}
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl bg-zinc-900 p-5">
          <h2 className="font-semibold">Some experiments don’t stick.</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            Keep them in your timeline. A short note about why you moved on can help the next
            person.
          </p>
          <a
            href="https://www.reddit.com/r/TokenRats/"
            className="mt-4 inline-block text-sm text-rat-400"
          >
            Talk it through on Reddit ↗
          </a>
        </div>
        <a href="/app/boards" className="block text-sm text-zinc-400">
          See how your friends rank →
        </a>
      </aside>
    </div>
  );
}
