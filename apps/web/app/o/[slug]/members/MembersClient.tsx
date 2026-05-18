"use client";

/**
 * Client component for the members management page.
 * Handles the invite form with live feedback.
 */

import { useState } from "react";
import type { OrgMember } from "@token-rats/contracts";
import { Avatar } from "../../../../components/ui/Avatar";
import { Button } from "../../../../components/ui/Button";
import { Card } from "../../../../components/ui/Card";
import { createOrgInvite } from "../../../../lib/api";

interface Props {
  slug: string;
  initialMembers: OrgMember[];
}

export function MembersClient({ slug, initialMembers }: Props) {
  const [githubLogin, setGithubLogin] = useState("");
  const [email, setEmail] = useState("");
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!githubLogin.trim() && !email.trim()) {
      setError("Enter a GitHub login or email address");
      return;
    }
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      await createOrgInvite(slug, {
        ...(githubLogin.trim() ? { githubLogin: githubLogin.trim() } : {}),
        ...(email.trim() ? { email: email.trim() } : {}),
      });
      setSuccess(
        `Invite sent to ${githubLogin.trim() || email.trim()}. They can accept at tokenrats.dev/o/${slug}/accept.`,
      );
      setGithubLogin("");
      setEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send invite");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-black tracking-tight">Members</h1>
        <p className="mt-1 text-zinc-500">Invite teammates by GitHub login or email.</p>
      </div>

      {/* Invite form */}
      <Card>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-zinc-500">
          Send an invite
        </h2>
        <form onSubmit={(e) => void handleInvite(e)} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-zinc-300" htmlFor="gh">
              GitHub login
            </label>
            <input
              id="gh"
              type="text"
              value={githubLogin}
              onChange={(e) => setGithubLogin(e.target.value)}
              placeholder="octocat"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-zinc-100 placeholder-zinc-600 focus:border-rat-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-zinc-300" htmlFor="email">
              — or email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="alice@example.com"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-zinc-100 placeholder-zinc-600 focus:border-rat-500 focus:outline-none"
            />
          </div>

          {error && (
            <p className="rounded-lg border border-red-800 bg-red-900/20 px-4 py-3 text-sm text-red-400">
              {error}
            </p>
          )}
          {success && (
            <p className="rounded-lg border border-green-800 bg-green-900/20 px-4 py-3 text-sm text-green-400">
              {success}
            </p>
          )}

          <Button type="submit" disabled={loading}>
            {loading ? "Sending…" : "Send invite"}
          </Button>
        </form>
      </Card>

      {/* Member list */}
      <Card>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-zinc-500">
          Current members ({initialMembers.length})
        </h2>
        <ul className="space-y-3">
          {initialMembers.map((m) => (
            <li key={m.userId} className="flex items-center gap-3">
              <Avatar src={m.avatarUrl} handle={m.handle} size="sm" />
              <span className="flex-1 font-semibold">@{m.handle}</span>
              <span
                className={[
                  "rounded px-2 py-0.5 text-xs font-semibold",
                  m.role === "owner"
                    ? "bg-rat-900/30 text-rat-400"
                    : m.role === "admin"
                      ? "bg-zinc-800 text-zinc-300"
                      : "bg-zinc-900 text-zinc-500",
                ].join(" ")}
              >
                {m.role}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
