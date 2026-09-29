"use client";
import type { SetupDetail as Detail, SetupReview, ShelfStatus } from "@token-rats/contracts";
import { diffLines } from "diff";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { socialRequest } from "../../lib/social";
export const SHELVES: Record<ShelfStatus, string> = {
  want_to_try: "Want to try",
  trying: "Trying",
  using: "Using",
  tried: "Tried",
  dropped: "Dropped",
};
export function SetupDetail({ data, signedIn }: { data: Detail; signedIn: boolean }) {
  const { version: v, history, isOwner } = data;
  const router = useRouter();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [tab, setTab] = useState("setup");
  const [compare, setCompare] = useState(history.find((x) => x.number < v.number)?.id ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [following, setFollowing] = useState(data.following);
  const [review, setReview] = useState<SetupReview>(
    data.mine ?? { status: "want_to_try", stars: null, note: "" },
  );
  const previous = history.find((x) => x.id === compare);
  const url = `https://tokenrats.com/setups/${v.setupId}?v=${v.id}`;
  const reddit = `https://www.reddit.com/r/TokenRats/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(`${v.name} — @${v.handle}, v${v.number}`)}`;
  async function act(path: string, method = "POST", body?: unknown) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await socialRequest<{ id?: string; versionId?: string }>(path, {
        method,
        body: body ? JSON.stringify(body) : undefined,
      });
      router.refresh();
      return result;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    const r = await act(`setups/versions/${v.id}/copy`);
    if (r?.id) router.push(`/setups/${r.id}` as Route);
  }
  async function share() {
    try {
      if (navigator.share) await navigator.share({ title: v.name, url });
      else {
        await navigator.clipboard.writeText(url);
        setMessage("Link copied.");
      }
    } catch {
      setMessage("Copy this page’s address to share this version.");
    }
  }
  return (
    <div className="space-y-7">
      <header>
        <div className="mb-3 flex flex-wrap items-center gap-3 text-sm text-zinc-400">
          <a href={`/u/${v.handle}`} className="text-rat-400">
            @{v.handle}
          </a>
          <span>
            Version {v.number} · {new Date(v.createdAt).toISOString().slice(0, 10)}
          </span>
          <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-xs">
            {v.publishedAt ? "Shared" : "Private"}
          </span>
        </div>
        <h1 className="text-3xl font-black sm:text-4xl">{v.name}</h1>
        <p className="mt-3 text-sm text-zinc-400">
          {v.verdict === "retired"
            ? "Moved on — kept for the history."
            : v.verdict === "using"
              ? "Currently using this setup."
              : "An experiment in progress."}
        </p>
        {v.note && (
          <p className="mt-4 whitespace-pre-wrap break-words text-zinc-200 leading-7">{v.note}</p>
        )}
        <div className="mt-5 flex flex-wrap items-center gap-3 text-sm">
          {isOwner ? (
            <>
              <a
                href={`/setups/${v.setupId}/edit?v=${v.id}`}
                className="rounded-lg bg-rat-500 px-4 py-2 font-bold text-black"
              >
                {history[0]?.id === v.id ? "Save a new version" : "Restore as a new version"}
              </a>
              <button
                type="button"
                disabled={!ready || busy}
                onClick={() =>
                  act(`setups/versions/${v.id}/publish`, v.publishedAt ? "DELETE" : "POST")
                }
                className="rounded-lg border border-zinc-700 px-3 py-2"
              >
                {v.publishedAt ? "Make private" : "Publish this version"}
              </button>
              <button
                type="button"
                disabled={!ready || busy}
                onClick={() => act(`setups/${v.setupId}/feature`)}
                className="text-rat-400"
              >
                {v.featured ? "Featured on profile" : "Feature on profile"}
              </button>
            </>
          ) : signedIn ? (
            <>
              <button
                type="button"
                disabled={!ready || busy}
                onClick={copy}
                className="rounded-lg bg-rat-500 px-4 py-2 font-bold text-black"
              >
                Use this version
              </button>
              <button
                type="button"
                disabled={!ready || busy}
                onClick={async () => {
                  const r = await act(`setups/follow/${v.handle}`, following ? "DELETE" : "PUT");
                  if (r) setFollowing(!following);
                }}
                className="rounded-lg border border-zinc-700 px-3 py-2"
              >
                {following ? "Following" : "Follow"} @{v.handle}
              </button>
            </>
          ) : (
            <a href="/signin" className="text-rat-400">
              Sign in to save, rate, or follow
            </a>
          )}
          {v.publishedAt && (
            <>
              <button type="button" disabled={!ready} onClick={share} className="text-rat-400">
                Share
              </button>
              <a
                href={`/cards/setups/${v.id}?download=1`}
                download="token-rats-setup.png"
                className="text-zinc-300"
              >
                Download card
              </a>
            </>
          )}
          <a
            download={`${v.name.replace(/[^a-z0-9-]/gi, "-")}-v${v.number}.json`}
            href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify({ name: v.name, bundle: v.bundle, note: v.note, verdict: v.verdict }, null, 2))}`}
            className="text-zinc-400"
          >
            Export setup
          </a>
        </div>
        {v.originVersionId && (
          <p className="mt-3 text-xs text-zinc-500">
            {v.note.startsWith("Adapted from") ? v.note : "Adapted from another saved version."}
          </p>
        )}
      </header>
      {error && (
        <p role="alert" className="text-red-400">
          {error}
        </p>
      )}
      {message && <output className="text-rat-400">{message}</output>}
      <nav aria-label="Setup views" className="flex flex-wrap gap-6 border-b border-zinc-800">
        {[
          ["setup", "Setup"],
          ["timeline", `Timeline (${history.length})`],
          ["ratings", `Ratings & shelves (${v.ratingCount})`],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            disabled={!ready}
            onClick={() => setTab(key!)}
            className={`pb-3 text-sm ${tab === key ? "border-b-2 border-rat-500 text-rat-400" : "text-zinc-400"}`}
          >
            {label}
          </button>
        ))}
      </nav>
      {tab === "setup" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
          <section className="min-w-0 space-y-5">
            {v.bundle.files.map((f) => (
              <article
                key={f.name}
                className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900"
              >
                <div className="flex justify-between gap-3 border-b border-zinc-800 px-5 py-3">
                  <h2 className="font-mono text-sm font-bold">{f.name}</h2>
                  <a
                    href={`data:text/plain;charset=utf-8,${encodeURIComponent(f.content)}`}
                    download={f.name}
                    className="text-xs text-rat-400"
                  >
                    Download
                  </a>
                </div>
                <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words p-5 text-sm leading-6 text-zinc-300">
                  {f.content || "No instructions added."}
                </pre>
              </article>
            ))}
            {v.bundle.workflow && (
              <section className="rounded-xl border border-zinc-800 p-5">
                <h2 className="font-bold">How it works</h2>
                <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-zinc-300">
                  {v.bundle.workflow}
                </p>
              </section>
            )}
          </section>
          <aside className="space-y-5">
            {(
              [
                ["tools", "Tools & handlers"],
                ["models", "Agents & models"],
                ["subscriptions", "Subscriptions"],
              ] as const
            ).map(
              ([key, title]) =>
                v.bundle[key] && (
                  <section key={key} className="rounded-xl border border-zinc-800 p-5">
                    <h2 className="text-xs uppercase tracking-wider text-zinc-500">{title}</h2>
                    <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6">
                      {v.bundle[key]}
                    </p>
                  </section>
                ),
            )}
            <section className="rounded-xl bg-zinc-900 p-5">
              <h2 className="font-semibold">Tried it? Kept it? Dropped it?</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Rate this version and leave a short note. Bring the longer story to r/TokenRats.
              </p>
              {v.publishedAt && (
                <a
                  href={reddit}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-block text-sm text-rat-400"
                >
                  Discuss on Reddit ↗
                </a>
              )}
            </section>
          </aside>
        </div>
      )}
      {tab === "timeline" && (
        <section className="grid gap-8 lg:grid-cols-[240px_1fr]">
          <ol className="space-y-0 border-l border-zinc-700">
            {history.map((h) => (
              <li key={h.id} className="relative pb-6 pl-5">
                <span
                  className={`absolute -left-1 top-1.5 h-2 w-2 rounded-full ${h.id === v.id ? "bg-rat-500" : "bg-zinc-600"}`}
                />
                <a
                  href={`/setups/${h.setupId}?v=${h.id}`}
                  className={h.id === v.id ? "font-bold text-rat-400" : "font-semibold"}
                >
                  Version {h.number}
                </a>
                <p className="mt-1 text-xs text-zinc-500">
                  {new Date(h.createdAt).toISOString().slice(0, 10)} ·{" "}
                  {h.publishedAt ? "Shared" : "Private"}
                </p>
                <p className="mt-2 line-clamp-3 text-sm text-zinc-400">{h.note || h.verdict}</p>
              </li>
            ))}
          </ol>
          <div className="min-w-0">
            <label className="mb-5 block text-sm">
              Compare version {v.number} with
              <select
                aria-label="Compare with version"
                value={compare}
                onChange={(e) => setCompare(e.target.value)}
                className="appearance-none text-base sm:text-sm text-zinc-100 ml-3 rounded border border-zinc-700 bg-zinc-900 p-2"
              >
                <option value="">An empty setup</option>
                {history
                  .filter((h) => h.id !== v.id)
                  .map((h) => (
                    <option key={h.id} value={h.id}>
                      Version {h.number}
                    </option>
                  ))}
              </select>
            </label>
            {Array.from(
              new Set([
                ...(previous?.bundle.files.map((f) => f.name) ?? []),
                ...v.bundle.files.map((f) => f.name),
              ]),
            ).map((name) => (
              <section
                key={name}
                className="mb-4 overflow-hidden rounded-xl border border-zinc-800"
              >
                <h3 className="bg-zinc-900 px-4 py-2 font-mono text-sm">{name}</h3>
                <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words p-4 text-xs leading-6">
                  {diffLines(
                    previous?.bundle.files.find((f) => f.name === name)?.content ?? "",
                    v.bundle.files.find((f) => f.name === name)?.content ?? "",
                    { timeout: 1000 },
                  )?.map((part, i) => (
                    <span
                      // biome-ignore lint/suspicious/noArrayIndexKey: diff segments are an immutable render result.
                      key={i}
                      className={
                        part.added
                          ? "bg-emerald-950 text-emerald-300"
                          : part.removed
                            ? "bg-red-950 text-red-300"
                            : "text-zinc-500"
                      }
                    >
                      {part.value
                        .split("\n")
                        .filter((line, j, a) => line || j < a.length - 1)
                        .map((line) => `${part.added ? "+" : part.removed ? "−" : " "} ${line}\n`)
                        .join("")}
                    </span>
                  )) ?? "Open each version to compare this file."}
                </pre>
              </section>
            ))}
            {(["workflow", "tools", "models", "subscriptions"] as const)
              .filter((k) => (previous?.bundle[k] ?? "") !== v.bundle[k])
              .map((k) => (
                <div key={k} className="mb-3 rounded-lg border border-zinc-800 p-4 text-sm">
                  <h3 className="mb-2 capitalize text-zinc-400">{k}</h3>
                  <p className="whitespace-pre-wrap break-words text-red-300">
                    − {previous?.bundle[k] || "None"}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap break-words text-emerald-300">
                    + {v.bundle[k] || "None"}
                  </p>
                </div>
              ))}
          </div>
        </section>
      )}
      {tab === "ratings" && (
        <section className="max-w-2xl space-y-6">
          {signedIn && !isOwner && v.publishedAt && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const r = await act(`setups/versions/${v.id}/review`, "PUT", review);
                if (r) setMessage("Saved to your shelf.");
              }}
              className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900 p-5"
            >
              <h2 className="font-semibold">On my shelf</h2>
              <div className="flex flex-wrap gap-4">
                <label className="text-sm">
                  Status
                  <select
                    aria-label="Shelf status"
                    value={review.status}
                    onChange={(e) => {
                      const status = e.target.value as ShelfStatus;
                      setReview({
                        ...review,
                        status,
                        stars: ["want_to_try", "trying"].includes(status) ? null : review.stars,
                      });
                    }}
                    className="appearance-none text-base sm:text-sm text-zinc-100 ml-2 rounded border border-zinc-700 bg-zinc-950 p-2"
                  >
                    {Object.entries(SHELVES).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  Rating
                  <select
                    aria-label="Rating"
                    value={review.stars ?? ""}
                    disabled={["want_to_try", "trying"].includes(review.status)}
                    onChange={(e) =>
                      setReview({
                        ...review,
                        stars: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    className="appearance-none text-base sm:text-sm text-zinc-100 ml-2 rounded border border-zinc-700 bg-zinc-950 p-2"
                  >
                    <option value="">Unrated</option>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {"★".repeat(n)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block text-sm">
                A short note
                <textarea
                  aria-label="A short note"
                  value={review.note}
                  maxLength={500}
                  onChange={(e) => setReview({ ...review, note: e.target.value })}
                  rows={3}
                  placeholder="What did you like, or why did you drop it?"
                  className="mt-2 w-full text-base sm:text-sm rounded-lg border border-zinc-700 bg-zinc-950 p-3"
                />
              </label>
              <p className="text-xs text-zinc-500">
                Your note and shelf status are visible here when your profile is public. Longer
                discussions belong on Reddit.
              </p>
              <button
                disabled={!ready || busy}
                type="submit"
                className="rounded-lg bg-rat-500 px-4 py-2 text-sm font-bold text-black"
              >
                Save to shelf
              </button>
              {data.mine && (
                <button
                  disabled={!ready || busy}
                  type="button"
                  onClick={() => act(`setups/versions/${v.id}/review`, "DELETE")}
                  className="ml-4 text-sm text-zinc-400"
                >
                  Remove from shelf
                </button>
              )}
            </form>
          )}
          <h2 className="font-bold">
            {v.ratingCount
              ? `${v.averageRating?.toFixed(1)} / 5 · ${v.ratingCount} ratings`
              : "No ratings yet"}
          </h2>
          {data.reviews.map((r) => (
            <article key={r.userId} className="rounded-xl border border-zinc-800 p-5">
              <div className="flex flex-wrap justify-between gap-3 text-sm">
                <a href={`/u/${r.handle}`} className="text-rat-400">
                  @{r.handle}
                </a>
                <span>
                  {SHELVES[r.status]}{" "}
                  {r.stars && <span className="text-amber-400">{"★".repeat(r.stars)}</span>}
                </span>
              </div>
              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-300">
                {r.note}
              </p>
            </article>
          ))}
        </section>
      )}
      {isOwner && (
        <details className="pt-6 text-sm text-zinc-500">
          <summary className="cursor-pointer">Manage this setup</summary>
          <button
            type="button"
            disabled={!ready || busy}
            onClick={async () => {
              if (window.confirm("Delete this setup and all of its saved versions?")) {
                const r = await act(`setups/${v.setupId}`, "DELETE");
                if (r) router.push("/app/setups" as Route);
              }
            }}
            className="mt-4 text-red-400"
          >
            Delete setup and its history
          </button>
        </details>
      )}
    </div>
  );
}
