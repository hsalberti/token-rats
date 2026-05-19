/**
 * Root of the taskbar webview. Switches between Auth and Popover based on
 * presence of a stored auth token.
 */

import type { JSX } from "react";
import { useCallback, useEffect, useState } from "react";
import { Auth } from "./Auth.js";
import { Popover } from "./Popover.js";
import { loadToken } from "./lib/token-store.js";

type State = { kind: "loading" } | { kind: "anonymous" } | { kind: "authenticated"; token: string };

export default function App(): JSX.Element {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await loadToken();
        if (cancelled) return;
        setState(token ? { kind: "authenticated", token } : { kind: "anonymous" });
      } catch {
        if (!cancelled) setState({ kind: "anonymous" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleAuthenticated = useCallback((token: string) => {
    setState({ kind: "authenticated", token });
  }, []);

  const handleLoggedOut = useCallback(() => {
    setState({ kind: "anonymous" });
  }, []);

  if (state.kind === "loading") {
    return (
      <div className="flex h-full items-center justify-center text-sm text-zinc-500">Loading…</div>
    );
  }

  if (state.kind === "anonymous") {
    return <Auth onAuthenticated={handleAuthenticated} />;
  }

  return <Popover token={state.token} onLoggedOut={handleLoggedOut} />;
}
