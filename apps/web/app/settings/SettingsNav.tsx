"use client";

/**
 * SettingsNav — segmented control across the three settings sub-pages.
 * Renders inside the settings layout so any sub-page picks it up.
 */

import { usePathname } from "next/navigation";

const TABS = [
  { href: "/settings/profile", label: "Profile" },
  { href: "/settings/notifications", label: "Notifications" },
  { href: "/settings/referrals", label: "Invite friends" },
];

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Settings sections"
      className="mt-4 flex w-fit gap-1 rounded-xl border border-zinc-800 bg-zinc-900 p-1"
    >
      {TABS.map((t) => {
        const active = pathname?.startsWith(t.href);
        return (
          <a
            key={t.href}
            href={t.href}
            className={[
              "rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
              active ? "bg-rat-500 text-white shadow" : "text-zinc-400 hover:text-zinc-200",
            ].join(" ")}
          >
            {t.label}
          </a>
        );
      })}
    </nav>
  );
}
