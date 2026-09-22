"use client";
import { API_URL, proxyKey } from "@/lib/api";
import { useState } from "react";
export function ChatKey({
  provider,
  initialStored,
}: { provider: "openrouter" | "openai"; initialStored: boolean }) {
  const [stored, setStored] = useState(initialStored);
  const [key, setKey] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(remove: boolean) {
    setBusy(true);
    setStatus("");
    try {
      const result = await proxyKey(provider, remove ? "DELETE" : "POST", remove ? undefined : key);
      setStored(result.stored);
      setKey("");
      setStatus(remove ? "Key removed." : "Key saved.");
    } catch {
      setStatus("Could not update the key. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-4 rounded-xl border border-zinc-800 p-5">
      <h2 className="text-xl font-bold">{provider === "openrouter" ? "OpenRouter" : "OpenAI"}</h2>
      <p className="text-sm text-zinc-400">
        Chat Completions, with streaming and token tracking. Set your client base URL to:
      </p>
      <code className="block break-all text-sm">
        {API_URL}/v1/proxy/{provider}/v1
      </code>
      <p className="text-sm text-zinc-400">
        Use your Token Rats CLI token for client authentication. Your provider key below is used
        only for upstream requests. Responses API requests are not supported here.
      </p>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void save(false);
        }}
      >
        <label className="block">
          Provider API key
          <input
            type="password"
            required
            autoComplete="off"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            className="mt-2 w-full rounded border border-zinc-700 bg-zinc-900 p-3"
          />
        </label>
        <button type="submit" disabled={busy} className="rounded bg-rat-600 px-4 py-2">
          {stored ? "Replace key" : "Save key"}
        </button>
        {stored && (
          <button
            disabled={busy}
            type="button"
            onClick={() => save(true)}
            className="ml-4 text-red-400"
          >
            Remove key
          </button>
        )}
      </form>
      {status && <output className="text-sm">{status}</output>}
    </section>
  );
}
