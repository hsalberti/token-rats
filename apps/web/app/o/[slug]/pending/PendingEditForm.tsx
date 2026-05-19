"use client";

/**
 * Client-side edit form for a pending org. Submits via the same `createOrg`
 * helper used on /o/new — the API is idempotent on (founder, slug) so a
 * re-submit with the same slug updates the application instead of erroring.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../../../../components/ui/Button";
import { createOrg } from "../../../../lib/api";

interface Props {
  initialName: string;
  initialSlug: string;
  initialPlan: string;
  initialGithubOrgLogin: string;
}

export function PendingEditForm({
  initialName,
  initialSlug,
  initialPlan,
  initialGithubOrgLogin,
}: Props) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [slug, setSlug] = useState(initialSlug);
  const [plan, setPlan] = useState(initialPlan);
  const [githubOrgLogin, setGithubOrgLogin] = useState(initialGithubOrgLogin);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setSaved(false);
    try {
      await createOrg({
        name: name.trim(),
        slug: slug.trim(),
        ...(githubOrgLogin.trim() ? { githubOrgLogin: githubOrgLogin.trim() } : {}),
        ...(plan === "student" ? { student: true } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      setSaved(true);
      // If they changed the slug, redirect to the new pending page.
      if (slug.trim() !== initialSlug) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (router.push as (href: string) => void)(`/o/${slug.trim()}/pending`);
      } else {
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update application");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      <div>
        <label className="mb-1.5 block text-sm font-semibold text-zinc-300" htmlFor="edit-name">
          Org name
        </label>
        <input
          id="edit-name"
          type="text"
          required
          maxLength={64}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-zinc-100 placeholder-zinc-600 focus:border-rat-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-semibold text-zinc-300" htmlFor="edit-slug">
          Slug
        </label>
        <div className="flex items-center gap-2">
          <span className="text-zinc-500">/o/</span>
          <input
            id="edit-slug"
            type="text"
            required
            minLength={3}
            maxLength={48}
            pattern="[a-z0-9-]+"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
            className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-zinc-100 placeholder-zinc-600 focus:border-rat-500 focus:outline-none"
          />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-semibold text-zinc-300" htmlFor="edit-plan">
          Plan tier
        </label>
        <select
          id="edit-plan"
          value={plan}
          onChange={(e) => setPlan(e.target.value)}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-zinc-100 focus:border-rat-500 focus:outline-none"
        >
          <option value="free">Free (team)</option>
          <option value="student">Student / university (free)</option>
          <option value="pro">Pro</option>
        </select>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-semibold text-zinc-300" htmlFor="edit-github">
          GitHub org login <span className="font-normal text-zinc-500">(optional)</span>
        </label>
        <input
          id="edit-github"
          type="text"
          maxLength={100}
          value={githubOrgLogin}
          onChange={(e) => setGithubOrgLogin(e.target.value)}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-zinc-100 placeholder-zinc-600 focus:border-rat-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-semibold text-zinc-300" htmlFor="edit-note">
          Why us? <span className="font-normal text-zinc-500">(optional)</span>
        </label>
        <textarea
          id="edit-note"
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-zinc-100 placeholder-zinc-600 focus:border-rat-500 focus:outline-none"
        />
      </div>

      {error && (
        <p className="rounded-lg border border-red-800 bg-red-900/20 px-4 py-3 text-sm text-red-400">
          {error}
        </p>
      )}
      {saved && !error && (
        <p className="rounded-lg border border-emerald-800/60 bg-emerald-900/10 px-4 py-3 text-sm text-emerald-300">
          Saved.
        </p>
      )}

      <Button type="submit" disabled={loading}>
        {loading ? "Saving…" : "Save application"}
      </Button>
    </form>
  );
}
