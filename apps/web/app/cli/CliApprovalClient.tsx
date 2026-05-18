"use client";

import { useState } from "react";
import { api, ApiError } from "../../lib/api";
import type { User } from "@token-rats/contracts";
import { Button } from "../../components/ui/Button";
import { Avatar } from "../../components/ui/Avatar";

interface Props {
  user: User;
  initialCode: string;
}

export function CliApprovalClient({ user, initialCode }: Props) {
  const [busy, setBusy] = useState(false);
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const code = initialCode.trim();

  async function handleApprove() {
    if (!code) return;
    setBusy(true);
    setError(null);
    try {
      await api.approveCli(code);
      setApproved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Approval failed. Please try again.");
      setBusy(false);
    }
  }

  if (approved) {
    return (
      <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 text-center">
        <div className="p-8">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20 text-3xl">
            ✓
          </div>
          <h2 className="text-2xl font-black text-green-400">Approved!</h2>
          <p className="mt-2 text-zinc-400">
            You can return to your terminal. The CLI is now authenticated.
          </p>
        </div>
      </div>
    );
  }

  if (!code) {
    return (
      <div className="overflow-hidden rounded-2xl border border-red-900 bg-zinc-900">
        <div className="p-8 text-center">
          <p className="text-2xl font-black text-red-400">Missing code</p>
          <p className="mt-2 text-zinc-400">
            Visit this page from the link provided in your terminal after running{" "}
            <code className="rounded bg-zinc-800 px-1 py-0.5 font-mono text-rat-400">
              token-rats login
            </code>
            .
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
      <div className="p-8">
        <div className="mb-6 flex items-center gap-3">
          <Avatar src={user.avatarUrl} handle={user.handle} size="sm" />
          <span className="text-sm font-semibold text-zinc-300">@{user.handle}</span>
        </div>

        <h2 className="text-xl font-bold">Approve CLI access</h2>
        <p className="mt-1 mb-6 text-sm text-zinc-400">
          Authorise the Token Rats CLI to upload sessions on your behalf.
        </p>

        {/* Code display */}
        <div className="mb-6 rounded-xl border border-zinc-700 bg-zinc-950 px-6 py-5 text-center">
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Device code
          </p>
          <p className="font-mono text-3xl font-black tracking-widest text-rat-400">{code}</p>
        </div>

        <p className="mb-6 text-sm text-zinc-500">
          Confirm this code matches what your terminal displayed. Once approved, the CLI can sync
          token counts — it cannot read your prompts or completions.
        </p>

        {error && (
          <p className="mb-4 rounded-lg border border-red-900 bg-red-950/30 px-4 py-2 text-sm text-red-400">
            {error}
          </p>
        )}

        <Button onClick={handleApprove} disabled={busy} size="lg" className="w-full">
          {busy ? "Approving…" : "Approve"}
        </Button>
      </div>
    </div>
  );
}
