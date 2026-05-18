"use client";

import { CopyButton } from "./CopyButton";

export function InstallBlock() {
  const cmd = "npx token-rats sync";

  return (
    <div className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-4">
      <span className="select-all font-mono text-sm text-zinc-100 sm:text-base">{cmd}</span>
      <CopyButton text={cmd} label="Copy" className="ml-auto shrink-0" />
    </div>
  );
}
