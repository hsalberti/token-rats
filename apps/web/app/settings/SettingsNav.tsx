"use client";

/**
 * SettingsNav — segmented control across the three settings sub-pages.
 * Renders inside the settings layout so any sub-page picks it up.
 */

import { type I18nKey, type Locale, t } from "@/lib/i18n";
import { usePathname } from "next/navigation";

interface Props {
  locale: Locale;
}

const TABS: { href: string; key: I18nKey }[] = [
  { href: "/settings/profile", key: "settings.tab.profile" },
  { href: "/settings/notifications", key: "settings.tab.notifications" },
  { href: "/settings/referrals", key: "settings.tab.referrals" },
  { href: "/settings/orgs", key: "settings.tab.orgs" },
];

export function SettingsNav({ locale }: Props) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Settings sections"
      className="mt-4 flex w-fit gap-1 rounded-xl border border-zinc-800 bg-zinc-900 p-1"
    >
      {TABS.map((tab) => {
        const active = pathname?.startsWith(tab.href);
        return (
          <a
            key={tab.href}
            href={tab.href}
            className={[
              "rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
              active ? "bg-rat-500 text-white shadow" : "text-zinc-400 hover:text-zinc-200",
            ].join(" ")}
          >
            {t(locale, tab.key)}
          </a>
        );
      })}
    </nav>
  );
}
