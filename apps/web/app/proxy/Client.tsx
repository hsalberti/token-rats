"use client";

/**
 * ProxyKeyClient — client component for the /proxy trust page.
 *
 * Lets a signed-in user register or clear their per-user Anthropic API key.
 * The key is sent to POST /v1/proxy/keys/anthropic once and never echoed back.
 */

import { useState } from "react";
import { setProxyAnthropicKey, deleteProxyAnthropicKey } from "@/lib/api";

interface Props {
  /** Whether the user already has a key stored (passed from server component). */
  initialStored: boolean;
}

export function ProxyKeyClient({ initialStored }: Props) {
  const [stored, setStored] = useState(initialStored);
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "deleting" | "saved" | "deleted" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!apiKey.trim()) return;
    setStatus("saving");
    setErrorMsg("");
    try {
      await setProxyAnthropicKey(apiKey.trim());
      setStored(true);
      setApiKey("");
      setStatus("saved");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Failed to save key");
    }
  }

  async function handleDelete() {
    setStatus("deleting");
    setErrorMsg("");
    try {
      await deleteProxyAnthropicKey();
      setStored(false);
      setStatus("deleted");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Failed to delete key");
    }
  }

  return (
    <div className="space-y-6">
      {/* Status banner */}
      {status === "saved" && (
        <div className="rounded-md bg-green-900/40 border border-green-700 px-4 py-3 text-green-300 text-sm">
          Anthropic API key saved. Your requests will use it going forward.
        </div>
      )}
      {status === "deleted" && (
        <div className="rounded-md bg-zinc-800 border border-zinc-700 px-4 py-3 text-zinc-300 text-sm">
          API key removed. Proxy requests will now use the shared key (if configured) or fail.
        </div>
      )}
      {status === "error" && (
        <div className="rounded-md bg-red-900/40 border border-red-700 px-4 py-3 text-red-300 text-sm">
          {errorMsg}
        </div>
      )}

      {/* Current key status */}
      <div className="rounded-lg bg-zinc-800/60 border border-zinc-700 p-4">
        <p className="text-sm text-zinc-400 mb-1">Key status</p>
        {stored ? (
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-green-400">
              Stored (encrypted, never shown)
            </span>
            <button
              type="button"
              onClick={handleDelete}
              disabled={status === "deleting"}
              className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors"
            >
              {status === "deleting" ? "Removing..." : "Remove key"}
            </button>
          </div>
        ) : (
          <span className="text-sm text-zinc-500">No key stored</span>
        )}
      </div>

      {/* Save form */}
      <form onSubmit={handleSave} className="space-y-3">
        <div>
          <label htmlFor="api-key" className="block text-sm font-medium text-zinc-300 mb-1">
            {stored ? "Replace Anthropic API key" : "Set Anthropic API key"}
          </label>
          <input
            id="api-key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-ant-..."
            autoComplete="off"
            className="w-full rounded-md bg-zinc-800 border border-zinc-600 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-400"
          />
          <p className="mt-1 text-xs text-zinc-500">
            Sent over HTTPS and stored AES-256-GCM encrypted at rest. Never echoed back.
          </p>
        </div>
        <button
          type="submit"
          disabled={!apiKey.trim() || status === "saving"}
          className="w-full rounded-md bg-zinc-100 text-zinc-900 px-4 py-2 text-sm font-semibold hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {status === "saving" ? "Saving..." : stored ? "Update key" : "Save key"}
        </button>
      </form>
    </div>
  );
}
