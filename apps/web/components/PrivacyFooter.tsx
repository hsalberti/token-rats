/**
 * PrivacyFooter — slim, persistent reminder of mission Principle #1
 * ("counts only — we can't read your prompts") on authed surfaces.
 *
 * The marketing landing has its own louder version. This one keeps the
 * posture visible to logged-in users where the value prop otherwise
 * evaporates after sign-in.
 */
export function PrivacyFooter() {
  return (
    <footer className="mt-12 border-t border-zinc-800/60 px-6 py-4">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-[11px] text-zinc-500">
        <span aria-hidden>🔒</span>
        <span>Counts only — we literally can&apos;t read your prompts.</span>
        <span className="text-zinc-700">·</span>
        <a
          href="https://github.com/hsalberti/token-rats"
          target="_blank"
          rel="noopener noreferrer"
          className="text-zinc-400 hover:text-rat-400"
        >
          Verify the CLI on GitHub
        </a>
      </div>
    </footer>
  );
}
