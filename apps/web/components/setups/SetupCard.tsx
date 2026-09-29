import type { SetupVersion } from "@token-rats/contracts";
import { AUDIENCE } from "./Audience";
export function SetupCard({ version: v }: { version: SetupVersion }) {
  return (
    <article className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 sm:p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
        <a href={`/u/${v.handle}`} className="font-semibold text-zinc-200">
          @{v.handle}
        </a>
        <span>
          {new Date(v.publishedAt ?? v.createdAt).toISOString().slice(0, 10)} · v{v.number} ·{" "}
          {AUDIENCE[v.visibility]}
          {v.automatic && " · Auto-captured"}
        </span>
      </div>
      <a
        href={`/setups/${v.setupId}?v=${v.id}`}
        className="text-xl font-bold text-zinc-100 hover:text-rat-400"
      >
        {v.name}
      </a>
      <div className="my-3 flex gap-2 text-xs">
        <span className="rounded-full bg-zinc-800 px-2 py-1">
          {v.verdict === "experiment"
            ? "Trying it out"
            : v.verdict === "retired"
              ? "Moved on"
              : "Currently using"}
        </span>
        {v.featured && (
          <span className="rounded-full bg-rat-500/10 px-2 py-1 text-rat-400">Featured setup</span>
        )}
        {v.ratingCount > 0 && (
          <span className="py-1 text-amber-400">
            ★ {v.averageRating?.toFixed(1)} · {v.ratingCount}
          </span>
        )}
      </div>
      {v.note && (
        <p className="whitespace-pre-wrap break-words text-sm leading-6 text-zinc-300">{v.note}</p>
      )}
      <p className="mt-4 line-clamp-2 text-xs text-zinc-500">
        {[v.bundle.tools, v.bundle.models].filter(Boolean).join(" · ") ||
          v.bundle.files.map((f) => f.name).join(" · ")}
      </p>
      <a
        href={`/setups/${v.setupId}?v=${v.id}`}
        className="mt-4 inline-block text-sm font-semibold text-rat-400"
      >
        Explore this version →
      </a>
    </article>
  );
}
