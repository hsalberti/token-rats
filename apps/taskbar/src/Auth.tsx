/**
 * Device-code auth flow mirroring `packages/cli/src/commands/login.ts`:
 *  1. POST /v1/auth/cli/exchange → verificationUrl + pollToken.
 *  2. Show verification URL + code in popover; open it in the default browser
 *     via Tauri's opener plugin.
 *  3. Poll /v1/auth/cli/poll every 2s until success or expiry.
 *  4. Persist token via `token-store` (see ADR in that file).
 */

import { openUrl } from "@tauri-apps/plugin-opener";
import type { JSX } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiClient } from "./lib/api.js";
import { saveToken } from "./lib/token-store.js";

interface AuthProps {
  onAuthenticated: (token: string) => void;
}

interface ExchangeState {
  verificationUrl: string;
  pollToken: string;
  code: string;
  expiresAt: number;
}

function extractCode(url: string): string {
  const m = url.match(/[?&]code=([A-Z0-9-]+)/i);
  return m?.[1] ?? "";
}

export function Auth({ onAuthenticated }: AuthProps): JSX.Element {
  const [status, setStatus] = useState<"idle" | "starting" | "waiting" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [exchange, setExchange] = useState<ExchangeState | null>(null);
  const clientRef = useRef<ApiClient>(new ApiClient());

  const start = useCallback(async () => {
    setStatus("starting");
    setError(null);
    try {
      const result = await clientRef.current.cliExchange();
      const state: ExchangeState = {
        verificationUrl: result.verificationUrl,
        pollToken: result.pollToken,
        code: extractCode(result.verificationUrl),
        expiresAt: Date.now() + result.expiresIn * 1000,
      };
      setExchange(state);
      setStatus("waiting");
      // Try to open the verification URL in the default browser.
      // openUrl can be unavailable in dev without the plugin; ignore failures.
      try {
        await openUrl(state.verificationUrl);
      } catch {
        // user can still click the link manually
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    if (status !== "waiting" || !exchange) return;

    let cancelled = false;
    const tick = async (): Promise<void> => {
      if (cancelled) return;
      if (Date.now() >= exchange.expiresAt) {
        setError("Code expired. Please retry.");
        setStatus("error");
        return;
      }
      try {
        const token = await clientRef.current.cliPoll(exchange.pollToken);
        if (cancelled) return;
        if (token) {
          await saveToken(token);
          onAuthenticated(token);
          return;
        }
      } catch (e) {
        if (cancelled) return;
        if (e instanceof Error && e.message.includes("410")) {
          setError("Code expired. Please retry.");
          setStatus("error");
          return;
        }
        // Other errors: keep polling.
      }
      setTimeout(() => {
        void tick();
      }, 2000);
    };

    void tick();
    return () => {
      cancelled = true;
    };
  }, [status, exchange, onAuthenticated]);

  return (
    <div className="flex h-full flex-col items-center justify-center p-6 text-center">
      <h1 className="mb-2 text-lg font-semibold">Token Rats</h1>
      <p className="mb-4 text-xs text-zinc-400">Sign in to see your live token usage.</p>

      {status === "idle" ? (
        <button
          type="button"
          onClick={() => void start()}
          className="rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-medium text-zinc-950 hover:bg-emerald-400"
        >
          Sign in
        </button>
      ) : null}

      {status === "starting" ? <p className="text-sm text-zinc-400">Starting…</p> : null}

      {status === "waiting" && exchange ? (
        <div className="w-full text-left">
          <p className="mb-1 text-xs text-zinc-400">Open this URL in your browser:</p>
          <a
            href={exchange.verificationUrl}
            onClick={(e) => {
              e.preventDefault();
              void openUrl(exchange.verificationUrl).catch(() => {});
            }}
            className="block break-all text-xs font-medium text-emerald-400 hover:underline"
          >
            {exchange.verificationUrl}
          </a>
          {exchange.code ? (
            <p className="mt-3 text-xs text-zinc-400">
              Code: <span className="font-mono text-zinc-100">{exchange.code}</span>
            </p>
          ) : null}
          <p className="mt-3 text-xs text-zinc-500">Waiting for approval…</p>
        </div>
      ) : null}

      {status === "error" ? (
        <div className="w-full text-left">
          <p className="mb-2 text-xs text-red-400">{error}</p>
          <button
            type="button"
            onClick={() => void start()}
            className="rounded-md bg-zinc-800 px-3 py-1.5 text-sm font-medium hover:bg-zinc-700"
          >
            Retry
          </button>
        </div>
      ) : null}
    </div>
  );
}
