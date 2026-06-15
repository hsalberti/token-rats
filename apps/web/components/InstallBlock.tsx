"use client";

/**
 * InstallBlock — the canonical install snippet, used everywhere the user is
 * asked to run the CLI (landing, dashboard, onboarding). One implementation,
 * one copy story.
 *
 * Defaults to the two-step quick start (login → sync) so first-time visitors
 * understand the flow. Pass `variant="oneline"` for surfaces where the user is
 * already authed and only needs the sync command.
 *
 * Locale is passed in from the server-detected request locale so the static
 * copy localises without any client-side runtime negotiation.
 */

import { type Locale, t } from "../lib/i18n";
import { CopyButton } from "./CopyButton";

type Variant = "two-step" | "oneline";

interface Props {
  variant?: Variant;
  locale?: Locale;
}

const COMBINED = "npm install -g token-rats && token-rats login";

export function InstallBlock({ variant = "two-step", locale = "en" }: Props) {
  if (variant === "oneline") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-4">
        <span className="select-all font-mono text-sm text-zinc-100 sm:text-base">
          token-rats login
        </span>
        <CopyButton
          text="token-rats login"
          label={t(locale, "common.copy")}
          className="ml-auto shrink-0"
        />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 sm:p-5">
      <div className="space-y-2 font-mono text-sm">
        <Line cmd="npm install -g token-rats" />
        <Line cmd="token-rats login" />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-[11px] text-zinc-500">{t(locale, "install.runsLocally")}</p>
        <CopyButton text={COMBINED} label={t(locale, "install.copyBoth")} className="shrink-0" />
      </div>
    </div>
  );
}

function Line({ cmd }: { cmd: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="select-none text-zinc-600">$</span>
      <span className="select-all text-zinc-100">{cmd}</span>
    </div>
  );
}
