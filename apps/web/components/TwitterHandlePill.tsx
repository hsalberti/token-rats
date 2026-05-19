/**
 * v1.2 Track AC — Twitter/X verified handle pill.
 *
 * Renders the X bird+wordmark style as a small inline pill next to a display
 * name. Returns null when the user has not connected their X account, so
 * callers can always drop `<TwitterHandlePill handle={row.twitterHandle} />`
 * unconditionally.
 *
 * The handle prop should already be the verified handle (the API only fills
 * it after OAuth — see routes/leaderboard.ts, routes/trending.ts,
 * routes/profiles.ts, routes/rooms.ts).
 */

interface Props {
  handle: string | null | undefined;
  /** Render as a styled anchor pointing at twitter.com/<handle>. Default true. */
  asLink?: boolean;
}

export function TwitterHandlePill({ handle, asLink = true }: Props) {
  if (!handle) return null;

  const inner = (
    <>
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-3 w-3">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
      <span className="font-mono">@{handle}</span>
    </>
  );

  const className = [
    "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5",
    "text-[11px] font-semibold leading-none",
    "bg-zinc-800/80 text-zinc-300",
    "border border-zinc-700/60",
    asLink ? "hover:bg-zinc-700 hover:text-zinc-100 transition-colors" : "",
  ].join(" ");

  if (asLink) {
    return (
      <a
        href={`https://twitter.com/${handle}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className={className}
        aria-label={`@${handle} on X`}
        title={`@${handle} on X — verified`}
      >
        {inner}
      </a>
    );
  }

  return <span className={className}>{inner}</span>;
}
