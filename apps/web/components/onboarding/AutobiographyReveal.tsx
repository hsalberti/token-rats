"use client";

/**
 * AutobiographyReveal — animated step-by-step reveal of the Token Autobiography.
 *
 * Stats appear one-by-one via CSS animation (fade + slide up). Each stat card
 * is "screenshot-worthy" — big numbers, rat-orange accents. A skip link is
 * always present. The final step shows the share CTA.
 */

import type { AutobiographyStats } from "@token-rats/contracts";
import { useEffect, useState } from "react";
import { PrimarySourcePill } from "../SourcePill";
import { TwitterHandlePill } from "../TwitterHandlePill";

const DAY_NAMES = [
  "Sundays",
  "Mondays",
  "Tuesdays",
  "Wednesdays",
  "Thursdays",
  "Fridays",
  "Saturdays",
];

function fmtTokens(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return `${n}`;
}

function fmtCost(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function shortModel(model: string): string {
  if (model.includes("claude-3-5-sonnet")) return "Claude 3.5 Sonnet";
  if (model.includes("claude-3-5-haiku")) return "Claude 3.5 Haiku";
  if (model.includes("claude-3-opus")) return "Claude 3 Opus";
  if (model.includes("claude-sonnet-4")) return "Claude Sonnet 4";
  if (model.includes("claude-opus-4")) return "Claude Opus 4";
  if (model.includes("gpt-4o")) return "GPT-4o";
  if (model.includes("gpt-4")) return "GPT-4";
  if (model.includes("cursor")) return "Cursor";
  return model.length > 32 ? `${model.slice(0, 29)}...` : model;
}

// ---- Step definitions -------------------------------------------------------

type Step = {
  id: string;
  emoji: string;
  label: string;
  value: string;
  sub?: string;
  flavor?: string;
};

function buildSteps(s: AutobiographyStats): Step[] {
  const coffees = s.monthlyCoffees;
  const coffeeStr =
    coffees < 1
      ? "less than 1 coffee"
      : coffees < 2
        ? "1 coffee"
        : `${Math.floor(coffees)} coffees`;

  return [
    {
      id: "total-tokens",
      emoji: "🔥",
      label: "Total tokens burned",
      value: fmtTokens(s.totalTokens),
      sub: `${fmtCost(s.totalCostUsdCents)} all time`,
      flavor: "That's a lot of context.",
    },
    {
      id: "month-tokens",
      emoji: "📅",
      label: "This month",
      value: fmtTokens(s.monthTokens),
      sub: fmtCost(s.monthCostUsdCents),
      flavor: `Worth ${coffeeStr} at $5/cup.`,
    },
    {
      id: "biggest-session",
      emoji: "⚡",
      label: "Biggest single session",
      value: fmtTokens(s.biggestSessionTokens),
      sub: "tokens in one go",
      flavor: "When you really get in the zone.",
    },
    {
      id: "dominant-model",
      emoji: "🤖",
      label: "Favourite model",
      value: shortModel(s.dominantModel),
      sub: "by token volume",
      flavor: "Your AI of choice.",
    },
    {
      id: "most-active-day",
      emoji: "📆",
      label: "Most active day",
      value: DAY_NAMES[s.mostActiveDayOfWeek] ?? "Monday",
      sub: `${s.sessionsPerDay.toFixed(1)} sessions/day avg`,
      flavor: "Consistency is a superpower.",
    },
    {
      id: "sessions",
      emoji: "🧠",
      label: "Total sessions synced",
      value: s.totalSessions.toLocaleString(),
      sub: s.firstSyncDate ? `since ${s.firstSyncDate}` : "and counting",
      flavor: "Every session is a step forward.",
    },
  ];
}

// ---- Component --------------------------------------------------------------

interface Props {
  stats: AutobiographyStats;
  handle: string;
  /** v1.2 Track AC — verified Twitter/X handle for the pill next to display name. */
  twitterHandle?: string | null;
  /** v1.2 Track AF — kebab-case primary-source label rendered next to handle. */
  primarySource?: string | null;
}

export function AutobiographyReveal({ stats, handle, twitterHandle, primarySource }: Props) {
  const steps = buildSteps(stats);
  const [visibleCount, setVisibleCount] = useState(0);
  const [done, setDone] = useState(false);

  // Reveal one step at a time, 600ms apart after initial 200ms delay.
  useEffect(() => {
    if (visibleCount >= steps.length) {
      const t = setTimeout(() => setDone(true), 400);
      return () => clearTimeout(t);
    }
    const delay = visibleCount === 0 ? 200 : 600;
    const t = setTimeout(() => setVisibleCount((c) => c + 1), delay);
    return () => clearTimeout(t);
  }, [visibleCount, steps.length]);

  const shareUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/u/${handle}?og=autobiography`;

  function handleCopyLink() {
    const url = `${window.location.origin}/u/${handle}?og=autobiography`;
    navigator.clipboard.writeText(url).catch(() => {});
  }

  return (
    <div className="mx-auto max-w-xl w-full">
      {/* Verified handle pill + primary-source pill, surfaced once at the top
          so screenshot-share captures both the X identity and the dominant
          source alongside the autobiography stats. */}
      {(twitterHandle || primarySource) && (
        <div className="mb-3 flex items-center gap-2 text-sm text-zinc-400">
          <span>@{handle}</span>
          <TwitterHandlePill handle={twitterHandle} />
          <PrimarySourcePill source={primarySource} />
        </div>
      )}

      {/* Steps */}
      <div className="space-y-4">
        {steps.map((step, i) => (
          <StepCard key={step.id} step={step} visible={i < visibleCount} index={i} />
        ))}
      </div>

      {/* Share CTA — slides in after all steps revealed */}
      <div
        className={[
          "mt-8 rounded-2xl border border-rat-700/60 bg-rat-900/20 p-6 space-y-4",
          "transition-all duration-500",
          done ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none",
        ].join(" ")}
      >
        <div className="text-center space-y-1">
          <div className="text-2xl">🐀</div>
          <h2 className="text-lg font-black tracking-tight">
            That&apos;s your Token Autobiography
          </h2>
          <p className="text-sm text-zinc-400">
            Share it — let your friends know who burns the most.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <a
            href={shareUrl}
            target="_blank"
            rel="noreferrer"
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-rat-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-rat-600 transition-colors"
          >
            Share my autobiography →
          </a>
          <button
            type="button"
            onClick={handleCopyLink}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-800 px-4 py-2.5 text-sm font-semibold text-zinc-100 hover:bg-zinc-700 transition-colors"
          >
            Copy link
          </button>
        </div>

        <div className="text-center">
          <a
            href="/app"
            className="text-sm text-zinc-500 hover:text-zinc-300 underline underline-offset-2"
          >
            Or join a room to compare with friends →
          </a>
        </div>
      </div>

      {/* Skip link — always visible */}
      {!done && (
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => {
              setVisibleCount(steps.length);
              setDone(true);
            }}
            className="text-sm text-zinc-600 hover:text-zinc-400 underline underline-offset-2"
          >
            Skip to end
          </button>
        </div>
      )}
    </div>
  );
}

// ---- StepCard ---------------------------------------------------------------

function StepCard({
  step,
  visible,
  index,
}: {
  step: Step;
  visible: boolean;
  index: number;
}) {
  // Stagger via inline style for precise timing
  return (
    <div
      style={{ transitionDelay: `${index * 40}ms` }}
      className={[
        "rounded-2xl border p-5 transition-all duration-500",
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6 pointer-events-none",
        index === 0 ? "border-rat-700/60 bg-rat-900/20" : "border-zinc-800 bg-zinc-900",
      ].join(" ")}
    >
      <div className="flex items-start gap-4">
        <div className="text-3xl leading-none mt-0.5">{step.emoji}</div>
        <div className="flex-1 min-w-0">
          <p
            className={[
              "text-xs font-semibold uppercase tracking-widest",
              index === 0 ? "text-rat-500" : "text-zinc-500",
            ].join(" ")}
          >
            {step.label}
          </p>
          <p
            className={[
              "mt-1 text-4xl font-black tracking-tight leading-none truncate",
              index === 0 ? "text-rat-400" : "text-zinc-100",
            ].join(" ")}
          >
            {step.value}
          </p>
          {step.sub && <p className="mt-1.5 font-mono text-sm text-zinc-500">{step.sub}</p>}
          {step.flavor && <p className="mt-2 text-sm text-zinc-600 italic">{step.flavor}</p>}
        </div>
      </div>
    </div>
  );
}
