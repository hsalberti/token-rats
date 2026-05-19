"use client";

/**
 * /o/new — Create a new org.
 *
 * v1.2 Track AA: the form now reads as a "reserve your org" surface — every
 * submit creates the org row with status='pending' and lands the founder on
 * /o/<slug>/pending. The student checkbox flips the plan tier and reveals a
 * "university name" input that gets persisted to the waitlist payload.
 *
 * Client component so we can handle form state + POST without a Server Action.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../../../components/ui/Button";
import { createOrg } from "../../../lib/api";

export default function NewOrgPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [githubOrgLogin, setGithubOrgLogin] = useState("");
  const [student, setStudent] = useState(false);
  const [university, setUniversity] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await createOrg({
        name: name.trim(),
        slug: slug.trim(),
        ...(githubOrgLogin.trim() ? { githubOrgLogin: githubOrgLogin.trim() } : {}),
        ...(student ? { student: true } : {}),
        ...(student && university.trim() ? { university: university.trim() } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      // Always land on the pending page — the API soft-creates every org as
      // status='pending' until an admin approves it.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (router.push as (href: string) => void)(`/o/${slug.trim()}/pending`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create org");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center justify-between px-6 py-4">
          <a href="/app" className="text-sm text-zinc-500 hover:text-zinc-300">
            ← Dashboard
          </a>
          <a href="/" className="text-lg font-black tracking-tight">
            Token <span className="text-rat-500">Rats</span>
          </a>
          <div className="w-16" />
        </div>
      </header>

      <main className="mx-auto max-w-xl px-6 py-12">
        <h1 className="mb-2 text-3xl font-black tracking-tight">Create an org</h1>
        <p className="mb-6 text-zinc-400">
          Set up a private leaderboard for your company — Meta-style Claudeonomics, but yours.
        </p>

        <div className="mb-8 rounded-lg border border-amber-800/60 bg-amber-900/10 px-4 py-3 text-sm text-amber-300">
          Orgs are paused while we focus on the consumer surface — your org is reserved and
          we&apos;ll approve in a few days.
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-zinc-300" htmlFor="name">
              Org name
            </label>
            <input
              id="name"
              type="text"
              required
              maxLength={64}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Inc."
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-zinc-100 placeholder-zinc-600 focus:border-rat-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-zinc-300" htmlFor="slug">
              Slug <span className="font-normal text-zinc-500">(used in URLs)</span>
            </label>
            <div className="flex items-center gap-2">
              <span className="text-zinc-500">tokenrats.com/o/</span>
              <input
                id="slug"
                type="text"
                required
                minLength={3}
                maxLength={48}
                pattern="[a-z0-9-]+"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                placeholder="acme"
                className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-zinc-100 placeholder-zinc-600 focus:border-rat-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label
              className="mb-1.5 block text-sm font-semibold text-zinc-300"
              htmlFor="githubOrgLogin"
            >
              GitHub org login{" "}
              <span className="font-normal text-zinc-500">(optional — enables auto-invite)</span>
            </label>
            <input
              id="githubOrgLogin"
              type="text"
              maxLength={100}
              value={githubOrgLogin}
              onChange={(e) => setGithubOrgLogin(e.target.value)}
              placeholder="acme-corp"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-zinc-100 placeholder-zinc-600 focus:border-rat-500 focus:outline-none"
            />
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3">
            <label className="flex cursor-pointer items-start gap-3 text-sm text-zinc-200">
              <input
                type="checkbox"
                checked={student}
                onChange={(e) => setStudent(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-rat-500 focus:ring-rat-500"
              />
              <span>
                I&apos;m creating this for a university / student group{" "}
                <span className="text-rat-400">(free)</span>
              </span>
            </label>

            {student && (
              <div className="mt-4">
                <label
                  className="mb-1.5 block text-sm font-semibold text-zinc-300"
                  htmlFor="university"
                >
                  University name
                </label>
                <input
                  id="university"
                  type="text"
                  maxLength={200}
                  value={university}
                  onChange={(e) => setUniversity(e.target.value)}
                  placeholder="University of São Paulo"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-zinc-100 placeholder-zinc-600 focus:border-rat-500 focus:outline-none"
                />
              </div>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-zinc-300" htmlFor="note">
              Why us? <span className="font-normal text-zinc-500">(optional)</span>
            </label>
            <textarea
              id="note"
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="A short note for the approval queue…"
              rows={3}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-zinc-100 placeholder-zinc-600 focus:border-rat-500 focus:outline-none"
            />
          </div>

          {error && (
            <p className="rounded-lg border border-red-800 bg-red-900/20 px-4 py-3 text-sm text-red-400">
              {error}
            </p>
          )}

          <Button type="submit" disabled={loading} size="lg" className="w-full">
            {loading ? "Reserving…" : "Reserve your org"}
          </Button>
        </form>
      </main>
    </div>
  );
}
