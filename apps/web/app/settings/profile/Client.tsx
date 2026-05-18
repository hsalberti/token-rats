"use client";

/**
 * ProfileSettingsClient — client component for the profile settings page.
 *
 * Lets the signed-in user:
 *   - Toggle their profile public/private
 *   - Edit their bio (max 200 chars)
 *   - Set their Twitter/X handle
 *
 * Sends PATCH /v1/me on save.
 */

import { useState } from "react";
import { patchMe } from "@/lib/api";

interface Props {
  handle: string;
  initialPublicProfile: boolean;
  initialBio: string | null;
  initialTwitterHandle: string | null;
}

function Toggle({
  checked,
  onChange,
  disabled,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  id: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      id={id}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent",
        "transition-colors duration-200 ease-in-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        checked ? "bg-orange-500" : "bg-zinc-700",
      ].join(" ")}
    >
      <span
        className={[
          "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0",
          "transition-transform duration-200 ease-in-out",
          checked ? "translate-x-5" : "translate-x-0",
        ].join(" ")}
      />
    </button>
  );
}

export function ProfileSettingsClient({
  handle,
  initialPublicProfile,
  initialBio,
  initialTwitterHandle,
}: Props) {
  const [publicProfile, setPublicProfile] = useState(initialPublicProfile);
  const [bio, setBio] = useState(initialBio ?? "");
  const [twitterHandle, setTwitterHandle] = useState(initialTwitterHandle ?? "");
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveStatus("idle");

    try {
      await patchMe({
        publicProfile,
        bio: bio.trim() || null,
        twitterHandle: twitterHandle.trim() || null,
      });
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-8">
      {/* Public profile toggle */}
      <section className="bg-zinc-900 rounded-xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <label
              htmlFor="public-profile-toggle"
              className="font-semibold text-zinc-100 cursor-pointer"
            >
              Public profile
            </label>
            <p className="text-sm text-zinc-400 mt-1">
              When enabled, your handle, stats, and bio are visible to anyone — and you appear on
              the global /trending leaderboard.
            </p>
          </div>
          <Toggle
            id="public-profile-toggle"
            checked={publicProfile}
            onChange={setPublicProfile}
            disabled={saving}
          />
        </div>

        {/* Prominent warning */}
        {publicProfile && (
          <div className="rounded-lg border border-amber-700/50 bg-amber-900/20 px-4 py-3">
            <p className="text-sm text-amber-300 font-medium">
              Your handle and token stats will be publicly discoverable.
            </p>
            <p className="text-xs text-amber-400/80 mt-0.5">
              Anyone can find @{handle} on the trending page and via your profile URL.
            </p>
          </div>
        )}
      </section>

      {/* Bio */}
      <section className="space-y-2">
        <label htmlFor="bio" className="block text-sm font-semibold text-zinc-300">
          Bio
        </label>
        <textarea
          id="bio"
          value={bio}
          onChange={(e) => setBio(e.target.value.slice(0, 200))}
          disabled={saving}
          placeholder="A few words about yourself..."
          rows={3}
          maxLength={200}
          className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none disabled:opacity-50"
        />
        <p className="text-xs text-zinc-600 text-right">{bio.length}/200</p>
      </section>

      {/* Twitter handle */}
      <section className="space-y-2">
        <label htmlFor="twitter-handle" className="block text-sm font-semibold text-zinc-300">
          Twitter / X handle
        </label>
        <div className="flex items-center rounded-lg bg-zinc-900 border border-zinc-800 focus-within:ring-2 focus-within:ring-orange-500 overflow-hidden">
          <span className="px-3 py-3 text-zinc-500 text-sm select-none">@</span>
          <input
            id="twitter-handle"
            type="text"
            value={twitterHandle}
            onChange={(e) => setTwitterHandle(e.target.value.replace(/^@/, "").slice(0, 50))}
            disabled={saving}
            placeholder="yourhandle"
            maxLength={50}
            className="flex-1 bg-transparent px-0 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none disabled:opacity-50"
          />
        </div>
        <p className="text-xs text-zinc-600">
          Displayed as a link on your public profile.
        </p>
      </section>

      {/* Actions */}
      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "Saving..." : "Save changes"}
        </button>

        {saveStatus === "saved" && (
          <p className="text-sm text-green-400">Saved!</p>
        )}
        {saveStatus === "error" && (
          <p className="text-sm text-red-400">Failed to save. Please try again.</p>
        )}
      </div>
    </form>
  );
}
