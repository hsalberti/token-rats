"use client";

/**
 * SourcePicker — three-option segmented control for the "Add a source"
 * surface on /app. Top-level choices:
 *
 *   Claude Code · Codex · Other
 *
 * Claude Code and Codex tiles each direct the user at the CLI quick-start
 * for that source. "Other" is a no-op in v1 — it surfaces a placeholder
 * explaining that the broader IDE / API / Open-Source picker is coming
 * (Track P in roadmap-providers.md).
 *
 * Tile art is loaded from `/providers/<slug>.svg` (originally mirrored from
 * CodexBar, MIT — see NOTICES.md + assets/providers/README.md for the
 * trademark caveats that apply when these logos are shown).
 */

import { useState } from "react";
import { type Locale, t } from "../lib/i18n";
import { InstallBlock } from "./InstallBlock";
import { NodeInstallHint } from "./NodeInstallHint";
import { OtherSourcePicker } from "./OtherSourcePicker";

type SourceId = "claude-code" | "codex" | "other";

const OPTIONS: { id: SourceId; label: string; icon: string | null; subtitle: string }[] = [
  {
    id: "claude-code",
    label: "Claude Code",
    icon: "/providers/claude.svg",
    subtitle: "~/.claude/projects/**/*.jsonl",
  },
  {
    id: "codex",
    label: "Codex",
    icon: "/providers/codex.svg",
    subtitle: "~/.codex/sessions/**/*.jsonl",
  },
  { id: "other", label: "Other", icon: null, subtitle: "IDE · API · Open Source" },
];

interface SourcePickerProps {
  locale?: Locale;
}

export function SourcePicker({ locale = "en" }: SourcePickerProps) {
  const [selected, setSelected] = useState<SourceId>("claude-code");

  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label="Add a source" className="grid gap-3 sm:grid-cols-3">
        {OPTIONS.map((opt) => {
          const isActive = selected === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              // biome-ignore lint/a11y/useSemanticElements: styled card; behaves as a radio via aria-checked.
              role="radio"
              aria-checked={isActive}
              onClick={() => setSelected(opt.id)}
              className={`group flex flex-col items-start gap-2 rounded-xl border px-4 py-4 text-left transition-colors ${
                isActive
                  ? "border-rat-500 bg-rat-900/20"
                  : "border-zinc-800 bg-zinc-900 hover:border-zinc-700 hover:bg-zinc-800"
              }`}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-zinc-950">
                {opt.icon ? (
                  // Use <img> not next/image — these SVGs already have a
                  // viewBox + intrinsic sizing and we want them themed by
                  // the surrounding container's currentColor where the
                  // upstream marks support it.
                  <img src={opt.icon} alt="" width={20} height={20} className="h-5 w-5" />
                ) : (
                  <span aria-hidden className="text-zinc-500">
                    ···
                  </span>
                )}
              </div>
              <div>
                <p className={`text-sm font-bold ${isActive ? "text-rat-400" : "text-zinc-200"}`}>
                  {opt.label}
                </p>
                <p className="font-mono text-[11px] text-zinc-500">{opt.subtitle}</p>
              </div>
            </button>
          );
        })}
      </div>

      <SelectedDetail id={selected} locale={locale} />
    </div>
  );
}

function SelectedDetail({ id, locale }: { id: SourceId; locale: Locale }) {
  if (id === "other") {
    return <OtherSourcePicker />;
  }

  const sourceName = id === "claude-code" ? "Claude Code" : "Codex";

  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-400">{t(locale, "source.autodiscover", { sourceName })}</p>
      <InstallBlock locale={locale} />
      <NodeInstallHint locale={locale} />
    </div>
  );
}
