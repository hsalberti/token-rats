/**
 * SourcePill — small per-source tile used on /u/[handle] (Track Q) and
 * reusable on any surface that needs to show a `SessionRecord.source`
 * with its provider logo.
 *
 * Logo lookup: `/providers/${ICONS[source]}.svg`, falling back to a generic
 * monogram (the first letter of the source name in a circle) when an icon
 * isn't bundled.
 */

const ICONS: Record<string, string> = {
  "claude-code": "claude",
  codex: "codex",
  cursor: "cursor",
  // Track P "Other" branches will extend this map (openai, anthropic,
  // ollama, etc.) once they're wired up.
};

const DISPLAY_NAMES: Record<string, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
};

function fmtTokens(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return `${n}`;
}

function fmtCost(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export interface SourceTileProps {
  source: string;
  tokens: number;
  costUsdCents: number;
  sessions: number;
}

export function SourceTile({ source, tokens, costUsdCents, sessions }: SourceTileProps) {
  const iconSlug = ICONS[source];
  const name = DISPLAY_NAMES[source] ?? source;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-zinc-950 shrink-0">
          {iconSlug ? (
            <img
              src={`/providers/${iconSlug}.svg`}
              alt=""
              width={20}
              height={20}
              className="h-5 w-5"
            />
          ) : (
            <span aria-hidden className="text-xs font-bold uppercase text-zinc-400">
              {name.slice(0, 1)}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-zinc-200">{name}</p>
          <p className="font-mono text-[11px] text-zinc-500">
            {sessions} session{sessions === 1 ? "" : "s"}
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-baseline justify-between gap-2">
        <p className="text-xl font-black text-zinc-100">{fmtTokens(tokens)}</p>
        <p className="font-mono text-xs text-zinc-500">{fmtCost(costUsdCents)}</p>
      </div>
    </div>
  );
}

export interface SourceTilesProps {
  sources: SourceTileProps[];
}

export function SourceTiles({ sources }: SourceTilesProps) {
  if (sources.length === 0) return null;
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-500">By source</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sources.map((s) => (
          <SourceTile key={s.source} {...s} />
        ))}
      </div>
    </div>
  );
}
