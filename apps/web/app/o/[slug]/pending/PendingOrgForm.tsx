"use client";

/**
 * Editable founder name + email form for a pending org. PATCHes
 * /v1/orgs/:slug; on success shows a brief "Saved" badge.
 */

import { useState } from "react";
import { Button } from "../../../../components/ui/Button";
import { Card } from "../../../../components/ui/Card";
import { patchOrg } from "../../../../lib/api";

interface Props {
  slug: string;
  initialEmail: string;
  initialName: string;
}

export function PendingOrgForm({ slug, initialEmail, initialName }: Props) {
  const [email, setEmail] = useState(initialEmail);
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await patchOrg(slug, {
        founderEmail: email.trim(),
        founderName: name.trim() || undefined,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-zinc-300" htmlFor="email">
            Founder email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-zinc-100 focus:border-rat-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-zinc-300" htmlFor="name">
            Your name <span className="font-normal text-zinc-500">(optional)</span>
          </label>
          <input
            id="name"
            type="text"
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-zinc-100 focus:border-rat-500 focus:outline-none"
          />
        </div>

        {error && (
          <p className="rounded-lg border border-red-800 bg-red-900/20 px-4 py-3 text-sm text-red-400">
            {error}
          </p>
        )}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
          {saved && <span className="text-sm font-semibold text-rat-400">Saved ✓</span>}
        </div>
      </form>
    </Card>
  );
}
