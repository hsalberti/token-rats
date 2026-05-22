import { requireSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { getServerLocale } from "@/lib/server-locale";

export const runtime = "edge";

export const metadata = {
  title: "Orgs",
};

export default async function SettingsOrgsPage() {
  await requireSession();
  const locale = await getServerLocale();

  return (
    <main className="text-zinc-100 px-6 py-8">
      <div className="max-w-lg mx-auto">
        <h2 className="text-xl font-bold mb-2">{t(locale, "settings.orgs.title")}</h2>
        <p className="text-zinc-400 mb-6">{t(locale, "settings.orgs.body")}</p>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 flex flex-col gap-4">
          <a
            href="/o/new"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-rat-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-rat-900/40 transition-colors hover:bg-rat-600 active:bg-rat-700"
          >
            {t(locale, "settings.orgs.cta")}
          </a>
          <a
            href="/teams"
            className="text-sm font-semibold text-zinc-400 hover:text-rat-400 transition-colors"
          >
            {t(locale, "settings.orgs.learnMore")}
          </a>
        </div>
      </div>
    </main>
  );
}
