"use client";

/**
 * NodeInstallHint — small inline nudge for users who don't have Node/npm
 * installed and so can't run `npx token-rats …`. Appears 10s after mount,
 * detects OS via UA, and shows the matching one-liner install command
 * with a <details> expander for other platforms.
 *
 * Default OS is "mac" when detection fails — that's our most common
 * "I don't have Node" miss in practice.
 *
 * Help link slots in next to the Node hint and opens an X DM to @tokenratsx.
 */

import { useEffect, useState } from "react";
import { type Locale, t } from "../lib/i18n";
import { CopyButton } from "./CopyButton";

type OS = "mac" | "windows" | "linux";

const INSTALL: Record<OS, { label: string; cmd: string }> = {
  mac: { label: "macOS (Homebrew)", cmd: "brew install node" },
  windows: { label: "Windows (winget)", cmd: "winget install OpenJS.NodeJS.LTS" },
  linux: { label: "Linux (fnm)", cmd: "curl -fsSL https://fnm.vercel.app/install | bash" },
};

function detectOS(): OS {
  if (typeof navigator === "undefined") return "mac";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("win")) return "windows";
  if (ua.includes("mac")) return "mac";
  if (ua.includes("linux") || ua.includes("x11")) return "linux";
  return "mac";
}

interface Props {
  locale?: Locale;
}

export function NodeInstallHint({ locale = "en" }: Props) {
  const [visible, setVisible] = useState(false);
  const [os, setOs] = useState<OS>("mac");

  useEffect(() => {
    setOs(detectOS());
    const t = setTimeout(() => setVisible(true), 10_000);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  const primary = INSTALL[os];
  const others = (Object.keys(INSTALL) as OS[]).filter((k) => k !== os);

  return (
    <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/50 px-4 py-3 text-xs text-zinc-400">
      <div className="flex items-center justify-between gap-3">
        <p>
          {t(locale, "node.dontHaveNode")} <span className="text-zinc-500">{primary.label}:</span>
        </p>
        <a
          href="https://x.com/tokenratsx"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] font-semibold text-zinc-300 transition-colors hover:border-rat-700 hover:text-rat-400"
          aria-label={t(locale, "node.helpDm")}
          title={t(locale, "node.helpDm")}
        >
          <span aria-hidden>💬</span>
          <span>{t(locale, "node.helpDm")}</span>
        </a>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <code className="select-all font-mono text-[12px] text-zinc-200">{primary.cmd}</code>
        <CopyButton
          text={primary.cmd}
          label={t(locale, "common.copy")}
          className="ml-auto shrink-0"
        />
      </div>
      <details className="mt-2 group">
        <summary className="cursor-pointer text-[11px] text-zinc-500 hover:text-zinc-300">
          {t(locale, "node.otherPlatforms")}
        </summary>
        <ul className="mt-2 space-y-1.5">
          {others.map((k) => (
            <li key={k} className="flex items-center gap-2">
              <span className="w-32 shrink-0 text-zinc-500">{INSTALL[k].label}:</span>
              <code className="select-all font-mono text-[11px] text-zinc-300">
                {INSTALL[k].cmd}
              </code>
            </li>
          ))}
          <li className="text-[11px] text-zinc-500">
            {t(locale, "node.orDownload")}{" "}
            <a
              href="https://nodejs.org/en/download"
              target="_blank"
              rel="noreferrer"
              className="text-rat-400 underline underline-offset-2 hover:text-rat-300"
            >
              nodejs.org
            </a>
            .
          </li>
        </ul>
      </details>
    </div>
  );
}
