/**
 * SourcePill — small per-source tile used on /u/[handle] (Track Q) and
 * reusable on any surface that needs to show a `SessionRecord.source`
 * with its provider logo.
 *
 * Logo lookup: `/providers/${ICONS[source]}.svg`, falling back to a generic
 * monogram (the first letter of the source name in a circle) when an icon
 * isn't bundled.
 *
 * v1.2 Track AF — also exposes `<PrimarySourcePill>`: a small kebab-case
 * pill ("claude-max", "cursor-ide", "codex-api"…) rendered next to every
 * handle when the user's last-30d cost share for one source-plan combo is
 * ≥50%. The label is computed server-side; this component renders only.
 */

const ICONS: Record<string, string> = {
  "claude-code": "claude",
  codex: "codex",
  "codex-cli": "codex",
  cursor: "cursor",
  "token-rats-proxy": "claude",
  // Track P "Other" branches will extend this map (openai, anthropic,
  // ollama, etc.) once they're wired up.
};

/**
 * Maps a kebab-case primary-source label to its provider-icon slug.
 * Order matters: longer prefixes first so `claude-max` doesn't accidentally
 * match a hypothetical `claude` entry.
 */
const PRIMARY_LABEL_ICONS: { prefix: string; icon: string }[] = [
  { prefix: "claude-code", icon: "claude" },
  { prefix: "claude", icon: "claude" },
  { prefix: "cursor", icon: "cursor" },
  { prefix: "codex", icon: "codex" },
];

function iconForPrimaryLabel(label: string): string | null {
  for (const { prefix, icon } of PRIMARY_LABEL_ICONS) {
    if (label === prefix || label.startsWith(`${prefix}-`)) return icon;
  }
  return null;
}

export interface PrimarySourcePillProps {
  /**
   * Kebab-case label like `claude-max`, `cursor-ide`, `codex-api`, or a
   * bare-source fallback like `claude-code` / `cursor` / `codex` when the
   * user's plan tier is unknown. Renders nothing when `null`/`undefined`.
   */
  source: string | null | undefined;
  /** Optional class hook for spacing in the parent layout. */
  className?: string;
}

/**
 * Small monospace pill, rat-orange border on a neutral fill, kebab-case
 * label, no interactivity. Renders provider icon + label.
 */
export function PrimarySourcePill({ source, className }: PrimarySourcePillProps) {
  if (!source) return null;
  const icon = iconForPrimaryLabel(source);
  return (
    <span
      title={`Primary source over the last 30 days: ${source}`}
      className={[
        // Layout
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 align-middle",
        // Visual: rat-orange border, neutral fill, monospace kebab-case label
        "border border-rat-500/50 bg-zinc-900/60 font-mono text-[10px] font-semibold",
        "text-rat-300 leading-none whitespace-nowrap select-none",
        className ?? "",
      ].join(" ")}
    >
      {icon && (
        <img
          src={`/providers/${icon}.svg`}
          alt=""
          width={10}
          height={10}
          className="h-2.5 w-2.5 opacity-90"
        />
      )}
      {source}
    </span>
  );
}

const DISPLAY_NAMES: Record<string, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  "codex-cli": "Codex CLI",
  cursor: "Cursor",
  "token-rats-proxy": "Token Rats Proxy",
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
  title?: string;
}

export function SourceTiles({ sources, title = "By source" }: SourceTilesProps) {
  if (sources.length === 0) return null;
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-500">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sources.map((s) => (
          <SourceTile key={s.source} {...s} />
        ))}
      </div>
    </div>
  );
}
