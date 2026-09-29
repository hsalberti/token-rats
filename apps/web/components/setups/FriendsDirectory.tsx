"use client";
import { useState } from "react";
import { socialRequest } from "../../lib/social";
import { Avatar } from "../ui/Avatar";
import { FRIENDS_DESCRIPTION } from "./Audience";
export interface Person {
  id: string;
  handle: string;
  avatarUrl: string | null;
  following: number;
  followsYou: number;
  friend: number;
}
export function FriendsDirectory({ initial }: { initial: Person[] }) {
  const [people, setPeople] = useState(initial);
  const [mode, setMode] = useState("friends");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function load(next = mode) {
    setBusy(true);
    setError("");
    try {
      const result = await socialRequest<{ people: Person[] }>(
        `setups/people?friends=${next === "friends" ? "1" : "0"}&q=${encodeURIComponent(query)}`,
      );
      setPeople(result.people);
      setMode(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function follow(person: Person) {
    setBusy(true);
    setError("");
    try {
      await socialRequest(`setups/follow/${person.handle}`, {
        method: person.following ? "DELETE" : "PUT",
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-black">Friends</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">{FRIENDS_DESCRIPTION}</p>
        <p className="mt-2 text-sm text-zinc-400">
          Everyone on this list can see your friends-only setup history. Following someone on its
          own adds their public updates to your feed.
        </p>
      </div>
      <div className="flex gap-5 border-b border-zinc-800">
        {[
          ["friends", "Your friends"],
          ["find", "Find people"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            disabled={busy}
            onClick={() => load(key)}
            className={`pb-3 text-sm ${mode === key ? "border-b-2 border-rat-500 text-rat-400" : "text-zinc-400"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
        className="flex gap-3"
      >
        <input
          aria-label="Search people"
          placeholder="GitHub handle"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-sm"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-rat-500 px-4 py-2 text-sm font-bold text-black"
        >
          Find
        </button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      {!people.length && (
        <p className="rounded-xl border border-dashed border-zinc-700 p-6 text-sm text-zinc-400">
          {mode === "friends"
            ? "No friends found yet. Follow each other, or invite someone to a private board."
            : "No people found. Try another handle."}{" "}
          <a href="/app/boards" className="text-rat-400">
            Open boards →
          </a>
        </p>
      )}
      <ul className="divide-y divide-zinc-800">
        {people.map((person) => (
          <li key={person.id} className="flex items-center gap-3 py-4">
            <Avatar src={person.avatarUrl} handle={person.handle} size="sm" />
            <div className="min-w-0 flex-1">
              <a href={`/u/${person.handle}`} className="block truncate font-semibold">
                @{person.handle}
              </a>
              <p className="mt-1 text-xs text-zinc-400">
                {person.friend
                  ? person.following && person.followsYou
                    ? "Friend · you follow each other"
                    : "Friend · shared private board"
                  : person.followsYou
                    ? "Follows you · follow back to become friends"
                    : "Public updates"}
              </p>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => follow(person)}
              className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-rat-400"
            >
              {person.following ? "Unfollow" : person.followsYou ? "Follow back" : "Follow"}
            </button>
          </li>
        ))}
      </ul>
      <a href="/app" className="block text-sm text-rat-400">
        See your friends’ changes →
      </a>
    </section>
  );
}
