import { PrivacyFooter } from "@/components/PrivacyFooter";
import { UserMenu } from "@/components/UserMenu";
import { Wordmark } from "@/components/ui/Wordmark.js";
import { requireSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { getServerLocale } from "@/lib/server-locale";
import type { Metadata } from "next";
import { SettingsNav } from "./SettingsNav";

export const runtime = "edge";

export const metadata: Metadata = {
  title: {
    default: "Settings",
    template: "%s | Settings",
  },
};

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSession();
  const locale = await getServerLocale();

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <a href="/app" className="text-sm text-zinc-500 hover:text-zinc-300">
              {t(locale, "settings.backToApp")}
            </a>
            <a href="/">
              <Wordmark size="md" />
            </a>
          </div>
          <UserMenu user={user} locale={locale} />
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl px-6 pt-6">
        <h1 className="text-2xl font-black tracking-tight">{t(locale, "settings.title")}</h1>
        <SettingsNav locale={locale} />
      </div>

      <div className="flex-1">{children}</div>

      <PrivacyFooter />
    </div>
  );
}
