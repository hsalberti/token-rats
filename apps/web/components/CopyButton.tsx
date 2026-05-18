"use client";

import { useState } from "react";

interface CopyButtonProps {
  text: string;
  label?: string;
  className?: string;
}

export function CopyButton({ text, label = "Copy", className = "" }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback for environments without clipboard API
    }
  }

  return (
    <button
      onClick={handleCopy}
      className={[
        "rounded px-2 py-1 text-xs font-semibold transition-colors",
        copied
          ? "bg-green-600 text-white"
          : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600 hover:text-white",
        className,
      ].join(" ")}
    >
      {copied ? "Copied!" : label}
    </button>
  );
}
