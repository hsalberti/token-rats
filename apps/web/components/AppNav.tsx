"use client";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { socialRequest } from "../lib/social";
export function AppNav({ handle }: { handle: string }) {
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh the inbox badge when navigation changes.
  useEffect(() => {
    let cancelled = false;
    const refresh = () =>
      socialRequest<{ unread: number }>("social/notifications")
        .then((r) => {
          if (!cancelled) setUnread(r.unread);
        })
        .catch(() => {});
    refresh();
    const timer = setInterval(refresh, 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [pathname]);
  return (
    <nav aria-label="Main navigation" className="border-b border-zinc-800 bg-zinc-950">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-5 gap-y-3 px-6 py-3 text-sm">
        {[
          ["/app", "Feed"],
          ["/app/setups", "My setups"],
          ["/app/stats", "Stats"],
          ["/app/boards", "Boards"],
          [`/u/${handle}`, "Profile"],
        ].map(([href, label]) => (
          <a
            key={href}
            href={href}
            aria-current={pathname === href ? "page" : undefined}
            className={
              pathname === href ? "font-bold text-rat-400" : "text-zinc-400 hover:text-white"
            }
          >
            {label}
          </a>
        ))}
        <a
          href="/app/notifications"
          className="ml-auto text-zinc-300"
          aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        >
          Inbox{" "}
          {unread > 0 && (
            <span className="rounded-full bg-rat-500 px-2 py-0.5 text-xs text-black">{unread}</span>
          )}
        </a>
      </div>
    </nav>
  );
}
