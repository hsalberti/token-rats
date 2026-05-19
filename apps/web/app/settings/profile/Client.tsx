"use client";

/**
 * ProfileSettingsClient — client component for the profile settings page.
 *
 * Lets the signed-in user:
 *   - Toggle their profile public/private
 *   - Edit their bio (max 200 chars)
 *   - Connect / disconnect their Twitter/X handle via OAuth (v1.2 Track AC),
 *     or set a manual (unverified) handle as a fallback.
 *
 * Sends PATCH /v1/me on save.
 */

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { API_URL, patchMe } from "@/lib/api";
import { ENDPOINTS } from "@token-rats/contracts";
import { TwitterHandlePill } from "@/components/TwitterHandlePill";

interface Props {
  handle: string;
  initialPublicProfile: boolean;
  initialBio: string | null;
  initialTwitterHandle: string | null;
  initialTwitterVerified: boolean;
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
  initialTwitterVerified,
}: Props) {
  const [publicProfile, setPublicProfile] = useState(initialPublicProfile);
  const [bio, setBio] = useState(initialBio ?? "");
  const [twitterHandle, setTwitterHandle] = useState(initialTwitterHandle ?? "");
  const [twitterVerified, setTwitterVerified] = useState(initialTwitterVerified);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const [twitterStatus, setTwitterStatus] = useState<"idle" | "connected" | "failed">("idle");
  const [disconnecting, setDisconnecting] = useState(false);

  const searchParams = useSearchParams();

  // Pick up ?twitter=connected|failed once after the OAuth round-trip.
  useEffect(() => {
    const flag = searchParams.get("twitter");
    if (flag === "connected") setTwitterStatus("connected");
    else if (flag === "failed") setTwitterStatus("failed");
  }, [searchParams]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveStatus("idle");

    try {
      // The verified handle is owned by the OAuth callback — don't let the
      // manual editor overwrite it. We only PATCH a `twitterHandle` when the
      // user is in the unverified-edit path.
      const payload = twitterVerified
        ? { publicProfile, bio: bio.trim() || null }
        : {
            publicProfile,
            bio: bio.trim() || null,
            twitterHandle: twitterHandle.trim() || null,
          };
      await patchMe(payload);
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
    } finally {
      setSaving(false);
    }
  }

  function handleConnectTwitter() {
    // Server-side OAuth: navigate the browser to the Worker so it can mint
    // the PKCE record and 302 us to twitter.com.
    window.location.href = `${API_URL}${ENDPOINTS.authTwitterStart}`;
  }

  async function handleDisconnectTwitter() {
    setDisconnecting(true);
    try {
      const res = await fetch(`${API_URL}${ENDPOINTS.twitterDisconnect}`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        setTwitterHandle("");
        setTwitterVerified(false);
        setTwitterStatus("idle");
      }
    } catch {
      // ignore; the button stays available
    } finally {
      setDisconnecting(false);
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

      {/* Twitter / X — verified via OAuth (v1.2 Track AC) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-semibold text-zinc-300">Twitter / X</label>
          {twitterVerified && <TwitterHandlePill handle={twitterHandle} />}
        </div>

        {twitterStatus === "connected" && (
          <div className="rounded-lg border border-green-700/50 bg-green-900/20 px-4 py-3">
            <p className="text-sm text-green-300 font-medium">
              Twitter/X connected — your verified handle now shows up on leaderboards.
            </p>
          </div>
        )}
        {twitterStatus === "failed" && (
          <div className="rounded-lg border border-red-700/50 bg-red-900/20 px-4 py-3">
            <p className="text-sm text-red-300 font-medium">
              Twitter/X verification failed. You can try again — nothing was saved.
            </p>
          </div>
        )}

        {twitterVerified ? (
          <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3">
            <p className="text-sm text-zinc-400">
              Verified via OAuth. Disconnecting clears the handle from your profile and every
              leaderboard pill.
            </p>
            <button
              type="button"
              onClick={handleDisconnectTwitter}
              disabled={disconnecting}
              className="ml-4 shrink-0 rounded-lg border border-zinc-700 px-3 py-1.5 text-sm font-semibold text-zinc-200 hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {disconnecting ? "Disconnecting…" : "Disconnect"}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <button
              type="button"
              onClick={handleConnectTwitter}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-100 px-4 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-white transition-colors"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              Connect Twitter / X
            </button>

            <div className="space-y-2">
              <p className="text-xs text-zinc-500">
                Or set an unverified handle manually (won&apos;t show as verified, no pill):
              </p>
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
            </div>
          </div>
        )}
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

        {saveStatus === "saved" && <p className="text-sm text-green-400">Saved!</p>}
        {saveStatus === "error" && (
          <p className="text-sm text-red-400">Failed to save. Please try again.</p>
        )}
      </div>
    </form>
  );
}
