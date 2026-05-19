"use client";

/**
 * /waitlist/companies — open form for company-team interest in Token Rats.
 *
 * v1.2 Track AA. Posts to `/v1/waitlists` with `topic='orgs'`. Anyone can hit
 * the page — no auth required. We carry the extra fields (size, use case) in
 * the note (we don't want to bloat the public schema for this one form).
 */

import { useState } from "react";
import { Button } from "../../../components/ui/Button";
import { submitWaitlist } from "../../../lib/api";

const SIZES = ["1–5", "6–25", "26–100", "101–500", "500+"];

export default function CompaniesWaitlistPage() {
  const [email, setEmail] = useState("");
  const [size, setSize] = useState(SIZES[1] ?? "6–25");
  const [useCase, setUseCase] = useState("");
  const [position, setPosition] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const note = `size=${size}\n\n${useCase.trim()}`.slice(0, 500);
      const res = await submitWaitlist({
        topic: "orgs",
        email: email.trim(),
        note,
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
        <h1 className="mb-2 text-3xl font-black tracking-tight">For companies</h1>
        <p className="mb-8 text-zinc-400">
          Private leaderboards, spend dashboards, and weekly recap for teams. We&apos;ll reach out
          as we open the org plan back up.
        </p>

        {position === null ? (
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-zinc-300" htmlFor="email">
                Work email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-zinc-100 placeholder-zinc-600 focus:border-rat-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-semibold text-zinc-300" htmlFor="size">
                Company size
              </label>
              <select
                id="size"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-zinc-100 focus:border-rat-500 focus:outline-none"
              >
                {SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s} people
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-semibold text-zinc-300" htmlFor="usecase">
                Use case
              </label>
              <textarea
                id="usecase"
                required
                rows={4}
                maxLength={400}
                value={useCase}
                onChange={(e) => setUseCase(e.target.value)}
                placeholder="What would your team use Token Rats for?"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-zinc-100 placeholder-zinc-600 focus:border-rat-500 focus:outline-none"
              />
            </div>

            {error && (
              <p className="rounded-lg border border-red-800 bg-red-900/20 px-4 py-3 text-sm text-red-400">
                {error}
              </p>
            )}

            <Button type="submit" disabled={loading} size="lg" className="w-full">
              {loading ? "Submitting…" : "Get on the list"}
            </Button>
          </form>
        ) : (
          <div className="rounded-xl border border-emerald-800/60 bg-emerald-900/10 p-6">
            <p className="text-2xl font-black text-emerald-300">You&apos;re #{position}.</p>
            <p className="mt-2 text-sm text-zinc-400">
              We&apos;ll email you at <span className="font-mono text-zinc-200">{email}</span> when
              we open the org plan back up.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
