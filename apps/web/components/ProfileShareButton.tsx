"use client";

import { type ProfileShareQuery, profileShareSearch } from "@token-rats/contracts";
import { useEffect, useRef, useState } from "react";

export function ProfileShareButton({
  handle,
  selection = {},
  label = "Share profile",
  publicProfile = true,
}: {
  handle: string;
  selection?: ProfileShareQuery;
  label?: string;
  publicProfile?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [attempt, setAttempt] = useState(0);
  const query = profileShareSearch(selection);
  const imagePath = `/cards/u/${encodeURIComponent(handle)}${query}`;
  const sharePath = `/u/${encodeURIComponent(handle)}/share${query}`;

  useEffect(() => {
    if (!open || !publicProfile) return;
    const controller = new AbortController();
    let objectUrl = "";
    setFile(null);
    setPreview("");
    setError("");
    void (async () => {
      try {
        const response = await fetch(imagePath, {
          signal: controller.signal,
          cache: "no-store",
          headers: attempt > 0 ? { "Cache-Control": "no-cache" } : undefined,
        });
        if (!response.ok) throw new Error("Image unavailable");
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setPreview(objectUrl);
        setFile(new File([blob], `token-rats-${handle}.png`, { type: "image/png" }));
      } catch {
        if (!controller.signal.aborted) setError("Could not generate your card. Please try again.");
      }
    })();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, imagePath, handle, publicProfile, attempt]);

  function download() {
    if (!file || !preview) return;
    const link = document.createElement("a");
    link.href = preview;
    link.download = file.name;
    link.click();
  }

  async function shareImage() {
    if (!file) return;
    setMessage("");
    try {
      // Prepare the file ahead of time so the share call retains the click gesture.
      if (navigator.canShare?.({ files: [file] }) && navigator.share) {
        await navigator.share({ files: [file], title: `@${handle} · Token Rats` });
      } else {
        download();
        setMessage("Image downloaded. Attach it to your post.");
      }
    } catch (err) {
      if (!(err instanceof Error && err.name === "AbortError"))
        setMessage("Sharing is unavailable here. Use Download PNG or Copy link.");
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(new URL(sharePath, window.location.origin).href);
      setMessage("Link copied — it includes the lines you selected.");
    } catch {
      setMessage("Open the share page below and copy its address.");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setMessage("");
          dialog.current?.showModal();
        }}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-rat-500 px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-rat-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-rat-500"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <path d="M12 16V3m-5 5 5-5 5 5M5 13v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" />
        </svg>
        {label}
      </button>
      <dialog
        ref={dialog}
        aria-label="Share your Token Rats profile"
        onClose={() => setOpen(false)}
        className="m-auto max-h-[90dvh] w-[min(920px,calc(100%-2rem))] overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-950 p-5 text-zinc-100 shadow-2xl backdrop:bg-black/80 sm:p-7"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">Your agent brief, ready to share.</h2>
            <p className="mt-1 text-sm text-zinc-400">
              30 days of tokens. Your favorite instructions.
            </p>
          </div>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm"
          >
            Close
          </button>
        </div>
        {!publicProfile ? (
          <p className="text-sm text-zinc-300">
            Make your profile public in{" "}
            <a href="/settings/profile" className="text-rat-400 underline">
              profile settings
            </a>{" "}
            to create a share card.
          </p>
        ) : (
          <>
            {preview ? (
              <img
                src={preview}
                width={1200}
                height={630}
                alt={`@${handle}'s last 30 days and favorite agent instructions`}
                className="h-auto w-full rounded-xl border border-zinc-800"
              />
            ) : (
              <output className="flex aspect-[1200/630] items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 p-6 text-center text-sm text-zinc-400">
                {error || "Generating your image…"}
              </output>
            )}
            {error && (
              <button
                type="button"
                onClick={() => setAttempt((value) => value + 1)}
                className="mt-3 text-sm text-rat-400"
              >
                Try again
              </button>
            )}
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={!file}
                onClick={shareImage}
                className="rounded-lg bg-rat-500 px-4 py-2.5 text-sm font-bold text-black disabled:opacity-40"
              >
                Share image
              </button>
              <button
                type="button"
                disabled={!file}
                onClick={download}
                className="rounded-lg border border-zinc-700 px-4 py-2.5 text-sm disabled:opacity-40"
              >
                Download PNG
              </button>
              <button
                type="button"
                disabled={!file}
                onClick={copyLink}
                className="rounded-lg border border-zinc-700 px-4 py-2.5 text-sm disabled:opacity-40"
              >
                Copy link
              </button>
            </div>
            <p className="mt-3 text-xs text-zinc-500">
              Top model and provider are ranked by tokens used in the last 30 days.
            </p>
            <a
              href={sharePath}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block text-sm text-rat-400"
            >
              Open share page ↗
            </a>
            <output className="mt-2 block text-sm text-zinc-300">{message}</output>
          </>
        )}
      </dialog>
    </>
  );
}
