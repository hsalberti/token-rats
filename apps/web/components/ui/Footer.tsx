import { TWITTER_ENABLED } from "../../lib/flags";
import { Wordmark } from "./Wordmark.js";

export function Footer() {
  return (
    <footer className="border-t border-zinc-800 px-6 py-8">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 sm:flex-row sm:justify-between">
        <Wordmark size="sm" />
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-zinc-500">
          <a
            href="https://www.npmjs.com/package/token-rats"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-zinc-300"
          >
            npm
          </a>
          <a href="/community" className="hover:text-zinc-300">
            Community
          </a>
          <a href="https://github.com/hsalberti/token-rats" className="hover:text-zinc-300">
            Source and docs
          </a>
          <a href="/changelog" className="hover:text-zinc-300">
            Changelog
          </a>
          {TWITTER_ENABLED && (
            <a
              href="https://twitter.com/tokenratsx"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-zinc-300"
            >
              @tokenratsx
            </a>
          )}
        </div>
      </div>
    </footer>
  );
}
