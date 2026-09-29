"use client";
import type { SetupVersion } from "@token-rats/contracts";
import { useEffect, useState } from "react";
import { socialRequest } from "../../lib/social";
export function Kudos({ version, canGive }: { version: SetupVersion; canGive: boolean }) {
  const [given, setGiven] = useState(version.viewerHasKudos);
  const [count, setCount] = useState(version.kudosCount);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => setReady(true), []);
  return (
    <div>
      <button
        type="button"
        aria-pressed={given}
        disabled={!ready || busy || !canGive}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await socialRequest(`setups/versions/${version.id}/kudos`, {
              method: given ? "DELETE" : "PUT",
            });
            setCount(Math.max(0, count + (given ? -1 : 1)));
            setGiven(!given);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
        className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold disabled:cursor-default ${given ? "border-rat-500/50 bg-rat-500/10 text-rat-400" : "border-zinc-700 text-zinc-300 enabled:hover:border-rat-500 enabled:hover:text-rat-400"}`}
      >
        <svg
          aria-hidden="true"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill={given ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.7"
        >
          <path d="M7 10v11H3V10h4Zm0 0 5-8c3 0 3 3 2 7h6a2 2 0 0 1 2 2l-2 8a2 2 0 0 1-2 2H7" />
        </svg>
        {given ? "Kudos given" : "Kudos"}
        <span className="tabular-nums">{count}</span>
      </button>
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
