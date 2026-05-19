"use client";

/**
 * /waitlist/provider — "track my tool" form for unsupported coding providers.
 *
 * v1.2 Track AA / unblocks v1.1 Track X. Reads `?id=<provider-id>` from the
 * query string. The id maps directly to the waitlist topic as
 * `provider:<id>`. The special `?id=other` case shows a free-text "which
 * tool?" field that gets folded into the note payload.
 */

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "../../../components/ui/Button";
import { submitWaitlist } from "../../../lib/api";

// Tiny pretty-print map. Anything not in here renders as the kebab-case id.
const PROVIDER_LABELS: Record<string, string> = {
  vscode: "VS Code (Copilot Chat)",
  "gemini-cli": "Gemini CLI",
  "google-aistudio": "Google AI Studio",
  windsurf: "Windsurf",
  zed: "Zed",
  jetbrains: "JetBrains AI Assistant",
  other: "Another tool",
};

export default function ProviderWaitlistPage() {
  const search = useSearchParams();
  const [providerId, setProviderId] = useState<string>("other");
  const [email, setEmail] = useState("");
  const [otherTool, setOtherTool] = useState("");
  const [note, setNote] = useState("");
  const [position, setPosition] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Read the id from the query string on mount. `useSearchParams` is a hook
  // that can return null during static rendering, so we treat the missing
  // case as "other".
  useEffect(() => {
    const id = search?.get("id");
    if (id && /^[a-z0-9-]+$/.test(id)) {
      setProviderId(id);
    }
  }, [search]);

  const label = PROVIDER_LABELS[providerId] ?? providerId;
  const isOther = providerId === "other";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const fullNote = [
        isOther && otherTool.trim() ? `tool=${otherTool.trim()}` : null,
        note.trim() || null,
      ]
        .filter(Boolean)
        .join("\n\n")
        .slice(0, 500);

      const res = await submitWaitlist({
        topic: `provider:${providerId}`,
        email: email.trim(),
        ...(fullNote ? { note: fullNote } : {}),
      });
      setPosition(res.position);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-4">
          <a href="/" className="text-sm text-zinc-500 hover:text-zinc-300">
            ← Home
          </a>
          <a href="/" className="text-lg font-black tracking-tight">
            Token <span className="text-rat-500">Rats</span>
          </a>
          <div className="w-16" />
        </div>
      </header>

      <main className="mx-auto max-w-xl px-6 py-12">
        <h1 className="mb-2 text-3xl font-black tracking-tight">
          Track <span className="text-rat-400">{label}</span>
        </h1>
        <p className="mb-8 text-zinc-400">
          We&apos;ll prioritize based on demand. Drop your email and we&apos;ll ping you when this
          source ships.
        </p>

        {position === null ? (
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-zinc-300" htmlFor="p-email">
                Email
              </label>
              <input
                id="p-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-zinc-100 placeholder-zinc-600 focus:border-rat-500 focus:outline-none"
              />
            </div>

            {isOther && (
              <div>
                <label
                  className="mb-1.5 block text-sm font-semibold text-zinc-300"
                  htmlFor="p-tool"
                >
                  Which tool?
                </label>
                <input
                  id="p-tool"
                  type="text"
                  required
                  maxLength={100}
                  value={otherTool}
                  onChange={(e) => setOtherTool(e.target.value)}
                  placeholder="e.g. Cody, Codeium, Continue…"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-zinc-100 placeholder-zinc-600 focus:border-rat-500 focus:outline-none"
                />
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-sm font-semibold text-zinc-300" htmlFor="p-note">
                Note <span className="font-normal text-zinc-500">(optional)</span>
              </label>
              <textarea
                id="p-note"
                rows={3}
                maxLength={400}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Anything we should know?"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-zinc-100 placeholder-zinc-600 focus:border-rat-500 focus:outline-none"
              />
            </div>

            {error && (
              <p className="rounded-lg border border-red-800 bg-red-900/20 px-4 py-3 text-sm text-red-400">
                {error}
              </p>
            )}

            <Button type="submit" disabled={loading} size="lg" className="w-full">
              {loading ? "Submitting…" : "Notify me"}
            </Button>
          </form>
        ) : (
          <div className="rounded-xl border border-emerald-800/60 bg-emerald-900/10 p-6">
            <p className="text-2xl font-black text-emerald-300">You&apos;re #{position}.</p>
            <p className="mt-2 text-sm text-zinc-400">
              We&apos;ll email <span className="font-mono text-zinc-200">{email}</span> when{" "}
              <span className="font-semibold text-zinc-200">{label}</span> ships.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
