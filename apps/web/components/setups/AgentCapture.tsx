"use client";
import type { SetupVisibility } from "@token-rats/contracts";
import { useEffect, useState } from "react";
import { AUDIENCE, FRIENDS_DESCRIPTION } from "./Audience";
export function AgentCapture() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [visibility, setVisibility] = useState<SetupVisibility>("private");
  const [status, setStatus] = useState("");
  const [instructions, setInstructions] = useState("");
  async function copy() {
    try {
      const response = await fetch("/skills/share-token-rats-setup/SKILL.md");
      if (!response.ok) throw new Error("Skill unavailable");
      const skill = await response.text();
      const prompt = `Use the skill below to inspect my current agent setup and ${visibility === "public" ? "publish a sanitized, reproducible public version on my Token Rats profile" : visibility === "friends" ? "share a sanitized, reproducible version with friends only on Token Rats" : "save a reproducible private version in Token Rats"}. Include my global and project instructions, tools, model roles, and coordination workflow. Preserve my local configuration. Return the saved version link.\n\n${skill}`;
      setInstructions(prompt);
      try {
        await navigator.clipboard.writeText(prompt);
        setStatus("Copied. Paste this into your coding agent.");
      } catch {
        setStatus("Select and copy the instructions below.");
      }
    } catch {
      setStatus("Could not load the skill. Use the download link below.");
    }
  }
  return (
    <section className="rounded-2xl border border-rat-500/30 bg-rat-500/5 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-rat-400">
            Let your agent do the work
          </p>
          <h2 className="text-xl font-bold">Your setup, captured for you.</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            Give your agent this skill. It finds your instructions and tools, writes the steps to
            reproduce your setup, and saves a version here.
          </p>
        </div>
        <button
          type="button"
          disabled={!ready}
          onClick={copy}
          className="rounded-lg bg-rat-500 px-4 py-2.5 text-sm font-bold text-black"
        >
          Copy agent instructions
        </button>
      </div>
      <label className="mt-4 block text-sm text-zinc-300">
        Save this snapshot for
        <select
          aria-label="Agent snapshot audience"
          disabled={!ready}
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as SetupVisibility)}
          className="ml-3 rounded-lg border border-zinc-700 bg-zinc-900 p-2"
        >
          {Object.entries(AUDIENCE).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <p className="mt-2 text-xs leading-5 text-zinc-500">
        {visibility === "friends"
          ? FRIENDS_DESCRIPTION
          : visibility === "public"
            ? "Anyone can read this snapshot. Your agent removes private details before sharing."
            : "Save privately and review before sharing."}{" "}
        This captures one version.
      </p>
      <div className="mt-4 flex flex-wrap gap-4 text-xs text-zinc-500">
        <a
          href="/skills/share-token-rats-setup/SKILL.md"
          download="SKILL.md"
          className="text-rat-400"
        >
          Download SKILL.md
        </a>
        <a href="/skill">How it works →</a>
        <span>One-time Token Rats sign-in may be needed.</span>
      </div>
      {status && <output className="mt-3 block text-sm text-rat-400">{status}</output>}
      {instructions && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-zinc-400">View the instructions</summary>
          <textarea
            readOnly
            aria-label="Agent skill instructions"
            value={instructions}
            rows={12}
            className="mt-3 w-full rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs"
          />
        </details>
      )}
    </section>
  );
}
