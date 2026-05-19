"use client";

/**
 * /o/new — Soft-create an org (v1.2 waitlist).
 *
 * Fields: name, slug, founder email, founder name (optional), requested plan.
 * On 201 the founder is redirected to `/o/<slug>/pending` to confirm.
 *
 * Client component so we can handle form state + POST without a Server Action.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "../../../components/ui/Button";
import { ApiError, createOrg } from "../../../lib/api";

type Plan = "free" | "student" | "pro";

const PLAN_OPTIONS: { value: Plan; label: string; tagline: string }[] = [
  { value: "free", label: "Free", tagline: "Personal use" },
  { value: "student", label: "Student", tagline: "Verified .edu / student org — free with approval" },
  { value: "pro", label: "Pro", tagline: "Company spend dashboard (billing TBD)" },
];

export default function NewOrgPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [founderEmail, setFounderEmail] = useState("");
  const [founderName, setFounderName] = useState("");
  const [githubOrgLogin, setGithubOrgLogin] = useState("");
  const [requestedPlan, setRequestedPlan] = useState<Plan>("free");
  const [error, setError] = useState<string | null>(null);
  const [existingSlug, setExistingSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setExistingSlug(null);
    setLoading(true);
    try {
      await createOrg({
        name: name.trim(),
        slug: slug.trim(),
        founderEmail: founderEmail.trim(),
        founderName: founderName.trim() || undefined,
        requestedPlan,
        ...(githubOrgLogin.trim() ? { githubOrgLogin: githubOrgLogin.trim() } : {}),
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (router.push as (href: string) => void)(`/o/${slug.trim()}/pending`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Best-effort: try to fetch the existing slug from the error body
        // shape; if that fails, show a generic message.
        setError(
          "You already have an org on the waitlist. We only allow one per user — find the existing one in your dashboard.",
        );
      } else {
        setError(err instanceof Error ? err.message : "Failed to create org");
      }
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
        <h1 className="mb-2 text-3xl font-black tracking-tight">Request an org</h1>
        <p className="mb-8 text-zinc-400">
          Orgs are on a manual approval queue right now — we'll review and flip you to active.
        </p>

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
              Slug <span className="font-normal text-zinc-500">(used in URLs, fixed at submit)</span>
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
            <label className="mb-1.5 block text-sm font-semibold text-zinc-300" htmlFor="founderEmail">
              Founder email
            </label>
            <input
              id="founderEmail"
              type="email"
              required
              value={founderEmail}
              onChange={(e) => setFounderEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-zinc-100 placeholder-zinc-600 focus:border-rat-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-zinc-500">
              We'll send approval updates here. No verification email yet — make sure it's typed right.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-zinc-300" htmlFor="founderName">
              Your name <span className="font-normal text-zinc-500">(optional)</span>
            </label>
            <input
              id="founderName"
              type="text"
              maxLength={80}
              value={founderName}
              onChange={(e) => setFounderName(e.target.value)}
              placeholder="Alex Founder"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-zinc-100 placeholder-zinc-600 focus:border-rat-500 focus:outline-none"
            />
          </div>

          <div>
            <span className="mb-1.5 block text-sm font-semibold text-zinc-300">Plan</span>
            <div className="space-y-2">
              {PLAN_OPTIONS.map((p) => (
                <label
                  key={p.value}
                  className={[
                    "flex items-start gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors",
                    requestedPlan === p.value
                      ? "border-rat-500 bg-rat-500/10"
                      : "border-zinc-800 bg-zinc-900 hover:border-zinc-700",
                  ].join(" ")}
                >
                  <input
                    type="radio"
                    name="plan"
                    value={p.value}
                    checked={requestedPlan === p.value}
                    onChange={() => setRequestedPlan(p.value)}
                    className="mt-1 accent-rat-500"
                  />
                  <div>
                    <p className="font-semibold text-zinc-100">{p.label}</p>
                    <p className="text-xs text-zinc-400">{p.tagline}</p>
                  </div>
                </label>
              ))}
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

          {error && (
            <p className="rounded-lg border border-red-800 bg-red-900/20 px-4 py-3 text-sm text-red-400">
              {error}
              {existingSlug ? (
                <>
                  {" "}
                  <a className="underline" href={`/o/${existingSlug}/pending`}>
                    Open it →
                  </a>
                </>
              ) : null}
            </p>
          )}

          <Button type="submit" disabled={loading} size="lg" className="w-full">
            {loading ? "Submitting…" : "Submit for approval"}
          </Button>
        </form>
      </main>
    </div>
  );
}
