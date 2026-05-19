import { t } from "../../lib/i18n";
import { getServerLocale } from "../../lib/server-locale";
import { Wordmark } from "./Wordmark.js";

export async function Footer() {
  const locale = await getServerLocale();
  return (
    <footer className="border-t border-zinc-800 px-6 py-8">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 sm:flex-row sm:justify-between">
        <Wordmark size="sm" />
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-zinc-500">
          <a
            href="https://github.com/hsalberti/token-rats"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-zinc-300"
          >
            GitHub
          </a>
          <a
            href="https://github.com/hsalberti/token-rats/blob/main/mission.md"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-zinc-300"
          >
            Mission
          </a>
          <a href="/changelog" className="hover:text-zinc-300">
            Changelog
          </a>
          <a
            href="https://twitter.com/tokenratsx"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-zinc-300"
          >
            @tokenratsx
          </a>
          <span>
            {t(locale, "footer.madeBy")}{" "}
            <a
              href="https://twitter.com/hsalberti"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-zinc-300"
            >
              @hsalberti
            </a>
          </span>
        </div>
      </div>
    </footer>
  );
}
