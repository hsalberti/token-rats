/**
 * Server-rendered top bar for every authenticated page. Composes the brand
 * mark + UserMenu, then wraps them in `SyncStatusShell` (client) which adds
 * the in-app "upgrade CLI" banner and the persistent sync-status chip.
 *
 * Drop-in replacement for the hand-crafted `<header>` blocks previously
 * duplicated across /app, /app/devices, /app/friends, /settings, /trending,
 * /teams, etc. Pass `user` + `locale` through from the page server component
 * — both come from `requireSession()` + `getServerLocale()`.
 */

import type { User } from "@token-rats/contracts";
import type { Locale } from "../lib/i18n";
import { SyncStatusShell } from "./SyncStatusShell";
import { UserMenu } from "./UserMenu";

interface Props {
  user: User;
  locale: Locale;
}

export function AuthedTopBar({ user, locale }: Props) {
  return <SyncStatusShell userMenuSlot={<UserMenu user={user} locale={locale} />} />;
}
