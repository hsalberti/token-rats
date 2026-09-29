"use client";
import type { SetupVersion } from "@token-rats/contracts";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { socialRequest } from "../../lib/social";
import { ProfileInstructions } from "./ProfileInstructions";
import { SetupCard } from "./SetupCard";
export function ProfileSetups({
  handle,
  versions,
  following: initial,
  isOwner,
  signedIn,
  publicProfile = true,
}: {
  handle: string;
  versions: SetupVersion[];
  following: boolean;
  isOwner: boolean;
  signedIn: boolean;
  publicProfile?: boolean;
}) {
  const router = useRouter();
  const [following, setFollowing] = useState(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function toggle() {
    setBusy(true);
    try {
      await socialRequest(`setups/follow/${handle}`, { method: following ? "DELETE" : "PUT" });
      setFollowing(!following);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold">Setups & favorites</h2>
        {isOwner ? (
          <a href="/app/setups" className="text-sm text-rat-400">
            Manage my setups →
          </a>
        ) : signedIn ? (
          <button
            type="button"
            disabled={busy}
            onClick={toggle}
            className="rounded-lg border border-rat-500/50 px-4 py-2 text-sm text-rat-400"
          >
            {following ? "Following" : "Follow"}
          </button>
        ) : (
          <a href="/signin" className="text-sm text-rat-400">
            Sign in to follow
          </a>
        )}
      </div>
      {error && (
        <p role="alert" className="text-red-400">
          {error}
        </p>
      )}
      {versions[0] && (
        <div>
          <ProfileInstructions
            key={versions[0].id}
            version={versions[0]}
            isOwner={isOwner}
            publicProfile={publicProfile}
          />
          <div className="mt-5 grid gap-5 sm:grid-cols-3">
            {(
              [
                ["tools", "Tools"],
                ["models", "Models"],
                ["subscriptions", "Subscriptions"],
              ] as const
            ).map(
              ([key, label]) =>
                versions[0]?.bundle[key] && (
                  <div key={key}>
                    <h3 className="text-xs text-zinc-500">{label}</h3>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm">
                      {versions[0].bundle[key]}
                    </p>
                  </div>
                ),
            )}
          </div>
        </div>
      )}
      {versions.map((v) => (
        <SetupCard key={v.id} version={v} />
      ))}
      {!versions.length && (
        <p className="rounded-xl border border-dashed border-zinc-800 p-5 text-sm text-zinc-500">
          {isOwner
            ? "Share your first setup with friends or publicly to start your timeline."
            : "No shared setups yet."}
        </p>
      )}
    </section>
  );
}
