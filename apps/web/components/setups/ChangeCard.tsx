import type { SetupFeed } from "@token-rats/contracts";
import { Avatar } from "../ui/Avatar";
import { AUDIENCE } from "./Audience";
import { Kudos } from "./Kudos";
export function ChangeCard({
  version: v,
  userId,
}: { version: SetupFeed["versions"][number]; userId: string }) {
  const change = v.change;
  const url = `/setups/${v.setupId}?v=${v.id}&changes=1`;
  const title =
    change.previousVersion === null
      ? "shared a setup"
      : change.additions + change.deletions
        ? "changed their setup"
        : "posted an update";
  return (
    <article
      className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900"
      aria-label={`Change by @${v.handle}`}
    >
      <header className="space-y-4 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <Avatar src={v.avatarUrl} handle={v.handle} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="text-sm">
              <a className="font-bold text-zinc-100" href={`/u/${v.handle}`}>
                @{v.handle}
              </a>{" "}
              <span className="text-zinc-400">{title}</span>
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              <time dateTime={new Date(v.publishedAt ?? v.createdAt).toISOString()}>
                {new Date(v.publishedAt ?? v.createdAt)
                  .toISOString()
                  .slice(0, 16)
                  .replace("T", " ")}{" "}
                UTC
              </time>
              {v.automatic && " · Auto-captured"}
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full border px-2 py-1 text-xs ${v.visibility === "friends" ? "border-rat-500/30 text-rat-400" : "border-zinc-700 text-zinc-400"}`}
          >
            {AUDIENCE[v.visibility]}
          </span>
        </div>
        {v.note && (
          <p className="whitespace-pre-wrap break-words text-sm leading-6 text-zinc-200">
            {v.note}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <a href={url} className="text-zinc-400 hover:text-rat-400">
            {v.name} · v{v.number}
          </a>
          <span className="flex gap-3 font-mono">
            <span className="text-emerald-400">+{change.additions}</span>
            <span className="text-red-400">−{change.deletions}</span>
          </span>
        </div>
      </header>
      {change.files.map((file) => (
        <section key={file.name} className="border-y border-zinc-800">
          <h2 className="bg-zinc-950/50 px-5 py-2 font-mono text-xs text-zinc-400">{file.name}</h2>
          <div className="overflow-hidden py-1 font-mono text-xs leading-6 sm:text-sm">
            {file.lines.map((line, i) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: positions in an immutable diff preview.
                key={i}
                className={`flex px-3 sm:px-5 ${line.kind === "added" ? "bg-emerald-950/70 text-emerald-200" : line.kind === "removed" ? "bg-red-950/60 text-red-200" : "text-zinc-500"}`}
              >
                <span
                  aria-label={
                    line.kind === "added"
                      ? "Added"
                      : line.kind === "removed"
                        ? "Removed"
                        : undefined
                  }
                  className="w-6 shrink-0 select-none"
                >
                  {line.kind === "added"
                    ? "+"
                    : line.kind === "removed"
                      ? "−"
                      : line.kind === "gap"
                        ? "…"
                        : " "}
                </span>
                <span className="min-w-0 whitespace-pre-wrap break-words">{line.text || " "}</span>
              </div>
            ))}
          </div>
        </section>
      ))}
      {!change.files.length && (
        <p className="px-5 pb-4 text-sm text-zinc-500">
          {change.truncated
            ? "Open this version to review the full change."
            : "The instructions are unchanged."}
        </p>
      )}
      <footer className="flex flex-wrap items-center justify-between gap-3 p-5 sm:px-6">
        <Kudos version={v} canGive={!!userId && userId !== v.ownerId} />
        <a href={url} className="text-sm text-rat-400">
          {change.truncated ? "See full changes" : "Open version"} →
        </a>
      </footer>
    </article>
  );
}
