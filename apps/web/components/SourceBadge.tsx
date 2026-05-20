/**
 * SourceBadge — compact provider chip used next to @handle on leaderboards.
 *
 * One badge per source. Pair with the dominant-first ordering returned by
 * `LeaderboardRow.topSources`. Uses the same /providers/*.svg assets as
 * SourcePill so the visual language is consistent across the app.
 */

const ICONS: Record<string, string> = {
  "claude-code": "claude",
  codex: "codex",
  cursor: "cursor",
};

const DISPLAY_NAMES: Record<string, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
};

export interface SourceBadgeProps {
  source: string;
}

export function SourceBadge({ source }: SourceBadgeProps) {
  const iconSlug = ICONS[source];
  const name = DISPLAY_NAMES[source] ?? source;

  return (
    <span
      title={name}
      className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-zinc-800/80 ring-1 ring-zinc-700"
    >
      {iconSlug ? (
        <img
          src={`/providers/${iconSlug}.svg`}
          alt={name}
          width={12}
          height={12}
          className="h-3 w-3 opacity-80"
        />
      ) : (
        <span aria-hidden className="text-[9px] font-bold uppercase text-zinc-400">
          {name.slice(0, 1)}
        </span>
      )}
    </span>
  );
}

export interface SourceBadgesProps {
  /** Pass the `topSources` field straight from a LeaderboardRow. */
  sources: { source: string }[] | undefined;
  /** Max badges to render. Defaults to 2 (matches contract cap). */
  max?: number;
}

export function SourceBadges({ sources, max = 2 }: SourceBadgesProps) {
  // Tolerate undefined: the contract types `topSources` as required (with a
  // Zod `.default([])`), but the client never re-parses responses, so any
  // endpoint that forgets to emit the field hands us undefined at runtime.
  if (!sources || sources.length === 0) return null;
  return (
    <span className="inline-flex items-center gap-1">
      {sources.slice(0, max).map((s) => (
        <SourceBadge key={s.source} source={s.source} />
      ))}
    </span>
  );
}
