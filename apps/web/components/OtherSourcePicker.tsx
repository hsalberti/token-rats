"use client";

/**
 * OtherSourcePicker — the "Other" branch of the source picker tree.
 * Expands into three second-level branches per roadmap-providers.md
 * Track P:
 *
 *   IDE   · Cursor, Antigravity, Other (IDE)
 *   API   · OpenAI, Anthropic, OpenRouter, Other (API)
 *   OSS   · Ollama, vLLM, llama.cpp, LM Studio, Other (Open Source)
 *
 * In v1 the picker is **visual only** — clicking a tile reveals the auth/
 * data-source scheme that will be wired up later (sourced from
 * `research/codexbar.md#how-it-accesses-token-data`) plus a "coming soon"
 * note. The picker shape is committed now so the CLI/parser work doesn't
 * have to retrofit a UI.
 *
 * Trademark disclaimer is rendered at the bottom of every tab — required
 * before any logo grid (see `assets/providers/README.md`).
 */

import { useState } from "react";

type Branch = "ide" | "api" | "oss";

interface Provider {
  id: string;
  label: string;
  icon: string | null; // filename under /providers/ (without .svg), or null
  /** Short "how usage is read" hint, sourced from research/codexbar.md. */
  auth: string;
  /** Whether usage is paid-API ($ cost), or free ($0 with optional estimate). */
  costMode: "paid" | "free";
}

const PROVIDERS: Record<Branch, Provider[]> = {
  ide: [
    {
      id: "cursor",
      label: "Cursor",
      icon: "cursor",
      auth: "Cursor sqlite cache (opt-in)",
      costMode: "paid",
    },
    {
      id: "antigravity",
      label: "Antigravity",
      icon: "antigravity",
      auth: "API key",
      costMode: "paid",
    },
    {
      id: "other-ide",
      label: "Other IDE",
      icon: null,
      auth: "API key or local config",
      costMode: "paid",
    },
  ],
  api: [
    { id: "openai", label: "OpenAI", icon: "codex", auth: "API key or OAuth", costMode: "paid" },
    {
      id: "anthropic",
      label: "Anthropic",
      icon: "claude",
      auth: "API key or OAuth",
      costMode: "paid",
    },
    {
      id: "openrouter",
      label: "OpenRouter",
      icon: "openrouter",
      auth: "API key",
      costMode: "paid",
    },
    { id: "other-api", label: "Other API", icon: null, auth: "API key", costMode: "paid" },
  ],
  oss: [
    {
      id: "ollama",
      label: "Ollama",
      icon: "ollama",
      auth: "Localhost API + history",
      costMode: "free",
    },
    { id: "vllm", label: "vLLM", icon: null, auth: "Localhost API", costMode: "free" },
    { id: "llamacpp", label: "llama.cpp", icon: null, auth: "Local log file", costMode: "free" },
    { id: "lmstudio", label: "LM Studio", icon: null, auth: "Localhost API", costMode: "free" },
    { id: "other-oss", label: "Other OSS", icon: null, auth: "Local log file", costMode: "free" },
  ],
};

const BRANCH_LABELS: Record<Branch, string> = {
  ide: "IDE",
  api: "Raw API",
  oss: "Open Source",
};

const BRANCH_DESCRIPTIONS: Record<Branch, string> = {
  ide: "AI-native editors with their own usage cache.",
  api: "Direct provider APIs — bring your own key.",
  oss: "Self-hosted runtimes. Counts at $0; opt into a fair-comparison rate.",
};

export function OtherSourcePicker() {
  const [branch, setBranch] = useState<Branch>("api");
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);

  const providers = PROVIDERS[branch];
  const active = providers.find((p) => p.id === selectedProvider);

  return (
    <div className="space-y-4">
      {/* Branch tabs */}
      <div
        role="tablist"
        aria-label="Other source category"
        className="flex gap-1 rounded-lg border border-zinc-800 bg-zinc-950 p-1"
      >
        {(Object.keys(BRANCH_LABELS) as Branch[]).map((b) => {
          const isActive = branch === b;
          return (
            <button
              key={b}
              role="tab"
              aria-selected={isActive}
              onClick={() => {
                setBranch(b);
                setSelectedProvider(null);
              }}
              className={
                "flex-1 rounded-md px-3 py-2 text-sm font-semibold transition-colors " +
                (isActive ? "bg-zinc-800 text-rat-400" : "text-zinc-400 hover:text-zinc-200")
              }
            >
              {BRANCH_LABELS[b]}
            </button>
          );
        })}
      </div>

      <p className="text-xs text-zinc-500">{BRANCH_DESCRIPTIONS[branch]}</p>

      {/* Provider tile grid */}
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {providers.map((p) => {
          const isActive = selectedProvider === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setSelectedProvider(isActive ? null : p.id)}
              className={
                "flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors " +
                (isActive
                  ? "border-rat-500 bg-rat-900/20"
                  : "border-zinc-800 bg-zinc-900 hover:border-zinc-700 hover:bg-zinc-800")
              }
            >
              <div className="flex h-6 w-6 items-center justify-center rounded bg-zinc-950 shrink-0">
                {p.icon ? (
                  <img
                    src={`/providers/${p.icon}.svg`}
                    alt=""
                    width={16}
                    height={16}
                    className="h-4 w-4"
                  />
                ) : (
                  <span aria-hidden className="text-[10px] font-bold uppercase text-zinc-500">
                    {p.label.slice(0, 1)}
                  </span>
                )}
              </div>
              <span className="truncate text-sm text-zinc-200">{p.label}</span>
            </button>
          );
        })}
      </div>

      {/* Selected provider detail */}
      {active && (
        <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-900/50 px-5 py-4">
          <p className="text-sm font-semibold text-zinc-200">{active.label} — coming soon</p>
          <p className="mt-1 text-xs text-zinc-500">
            Usage source: <span className="font-mono">{active.auth}</span>.
            {active.costMode === "free"
              ? " Self-hosted, so cost is $0 by default. A future per-room toggle will let you estimate spend at a chosen provider's rates."
              : " Cost will be computed from the provider's published $/MTok rates."}
          </p>
          <p className="mt-2 text-[11px] text-zinc-600">
            Track P in <span className="font-mono">roadmap-providers.md</span>.
          </p>
        </div>
      )}

      {/* Trademark disclaimer — required wherever any of these logos render. */}
      <p className="text-[11px] leading-relaxed text-zinc-600">
        Token Rats is an independent tool, not affiliated with Anthropic, OpenAI, Cursor, Google,
        OpenRouter, Ollama, or any other provider listed above. Logos are used for identification
        only.
      </p>
    </div>
  );
}
