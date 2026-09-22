"use client";
import { createCommunityPost, getCommunity } from "@/lib/api";
import { type CommunityPost, PostKind } from "@token-rats/contracts";
import { useEffect, useState } from "react";

const field = "w-full rounded border border-zinc-700 bg-zinc-900 p-3";
export function CommunityClient({ signedIn }: { signedIn: boolean }) {
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [kind, setKind] = useState("");
  const [next, setNext] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    getCommunity(kind)
      .then((data) => {
        if (active) {
          setPosts(data.posts);
          setNext(data.nextOffset);
        }
      })
      .catch(() => {
        if (active) setError("Could not load posts. Try again.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [kind]);
  return (
    <div className="space-y-6">
      {signedIn ? (
        <details className="rounded-xl border border-zinc-800 p-5">
          <summary className="cursor-pointer font-semibold text-rat-400">Share a post</summary>
          <form
            className="mt-4 space-y-3"
            onSubmit={async (event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              setBusy(true);
              setError("");
              try {
                const post = await createCommunityPost({
                  kind: PostKind.parse(data.get("kind")),
                  title: String(data.get("title")),
                  body: String(data.get("body")),
                });
                window.location.assign(`/community/${post.id}`);
              } catch {
                setError("Could not publish the post. Check the fields and try again.");
                setBusy(false);
              }
            }}
          >
            <label className="block">
              Category
              <select aria-label="Category" name="kind" className={field}>
                {PostKind.options.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label className="block">
              Title
              <input name="title" required minLength={3} maxLength={160} className={field} />
            </label>
            <label className="block">
              Post or AGENTS.md content
              <textarea
                name="body"
                required
                maxLength={30000}
                rows={9}
                className={`${field} font-mono text-sm`}
              />
            </label>
            <p className="text-sm text-zinc-400">
              Posts are public. Only share files that you want others to read and copy.
            </p>
            <button
              type="submit"
              disabled={busy}
              className="rounded bg-rat-600 px-4 py-2 disabled:opacity-50"
            >
              {busy ? "Publishing…" : "Publish post"}
            </button>
          </form>
        </details>
      ) : (
        <a href="/signin" className="block text-rat-400">
          Sign in to post or reply
        </a>
      )}
      <label className="block">
        Filter by category
        <select value={kind} onChange={(e) => setKind(e.target.value)} className={field}>
          <option value="">All posts</option>
          {PostKind.options.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </label>
      {error && (
        <p role="alert" className="text-red-400">
          {error}
        </p>
      )}
      {loading ? (
        <p>Loading posts…</p>
      ) : posts.length === 0 && !error ? (
        <p className="text-zinc-400">No posts yet. Share the first idea.</p>
      ) : (
        posts.map((post) => (
          <article key={post.id} className="border-b border-zinc-800 pb-5">
            <p className="text-xs text-zinc-500">
              {post.kind} · @{post.handle} · {post.replies} replies
            </p>
            <a
              href={`/community/${post.id}`}
              className="mt-2 block text-xl font-semibold hover:text-rat-400"
            >
              {post.title}
            </a>
            <p className="mt-2 line-clamp-2 text-sm text-zinc-400 whitespace-pre-wrap">
              {post.body.slice(0, 240)}
            </p>
          </article>
        ))
      )}
      {next !== null && (
        <button
          type="submit"
          disabled={busy}
          className="text-rat-400"
          onClick={async () => {
            setBusy(true);
            try {
              const data = await getCommunity(kind, next);
              setPosts([...posts, ...data.posts]);
              setNext(data.nextOffset);
            } catch {
              setError("Could not load more posts.");
            } finally {
              setBusy(false);
            }
          }}
        >
          Load more
        </button>
      )}
    </div>
  );
}
