"use client";
import { deleteCommunityItem, getCommunityThread, replyToCommunityPost } from "@/lib/api";
import type { CommunityThread } from "@token-rats/contracts";
import { useEffect, useState } from "react";

export function ThreadClient({ id, handle }: { id: string; handle: string | null }) {
  const [thread, setThread] = useState<CommunityThread | null>(null);
  const [error, setError] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    getCommunityThread(id)
      .then(setThread)
      .catch(() => setError("This post could not be loaded."));
  }, [id]);
  async function remove(itemId: string, reply = false) {
    setBusy(true);
    try {
      await deleteCommunityItem(itemId, reply);
      if (!reply) window.location.assign("/community");
      else setThread(await getCommunityThread(id));
    } catch {
      setError("Could not delete this item.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      {error && (
        <p role="alert" className="text-red-400">
          {error}
        </p>
      )}
      {!thread ? (
        !error && <p>Loading post…</p>
      ) : (
        <>
          <p className="text-sm text-zinc-400">
            {thread.post.kind} · @{thread.post.handle}
          </p>
          <h1 className="text-3xl font-bold break-words">{thread.post.title}</h1>
          <pre className="whitespace-pre-wrap break-words rounded-xl border border-zinc-800 bg-zinc-900 p-5 text-sm font-mono">
            {thread.post.body}
          </pre>
          {thread.post.kind === "agents-md" && (
            <button
              type="button"
              className="text-rat-400"
              onClick={() => {
                const url = URL.createObjectURL(
                  new Blob([thread.post.body], { type: "text/markdown;charset=utf-8" }),
                );
                const anchor = document.createElement("a");
                anchor.href = url;
                anchor.download = "AGENTS.md";
                anchor.click();
                URL.revokeObjectURL(url);
              }}
            >
              Download AGENTS.md
            </button>
          )}
          {handle === thread.post.handle && (
            <button
              disabled={busy}
              type="button"
              onClick={() => remove(id)}
              className="ml-4 text-red-400"
            >
              Delete post
            </button>
          )}
          <h2 className="text-xl font-semibold">Replies</h2>
          {thread.replies.map((reply) => (
            <article key={reply.id} className="border-t border-zinc-800 pt-4">
              <p className="text-sm text-zinc-400">@{reply.handle}</p>
              <p className="mt-2 whitespace-pre-wrap break-words">{reply.body}</p>
              {handle === reply.handle && (
                <button
                  disabled={busy}
                  type="button"
                  onClick={() => remove(reply.id, true)}
                  className="mt-2 text-sm text-red-400"
                >
                  Delete reply
                </button>
              )}
            </article>
          ))}
          {thread.nextOffset !== null && (
            <button
              disabled={busy}
              type="button"
              className="text-rat-400"
              onClick={async () => {
                setBusy(true);
                try {
                  const next = await getCommunityThread(id, thread.nextOffset ?? 0);
                  setThread({ ...next, replies: [...thread.replies, ...next.replies] });
                } catch {
                  setError("Could not load more replies.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Load more replies
            </button>
          )}
          {handle ? (
            <form
              className="space-y-3"
              onSubmit={async (event) => {
                event.preventDefault();
                setBusy(true);
                setError("");
                try {
                  await replyToCommunityPost(id, body);
                  setBody("");
                  setThread(await getCommunityThread(id));
                } catch {
                  setError("Could not publish your reply.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label className="block">
                Your reply
                <textarea
                  required
                  maxLength={10000}
                  rows={5}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="mt-2 w-full rounded border border-zinc-700 bg-zinc-900 p-3"
                />
              </label>
              <button
                type="submit"
                disabled={busy}
                className="rounded bg-rat-600 px-4 py-2 disabled:opacity-50"
              >
                Post reply
              </button>
            </form>
          ) : (
            <a href="/signin" className="text-rat-400">
              Sign in to reply
            </a>
          )}
        </>
      )}
    </div>
  );
}
