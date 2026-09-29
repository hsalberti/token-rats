"use client";

import type { SetupDetail, SetupVersion } from "@token-rats/contracts";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { socialRequest } from "../../lib/social";
import { ProfileShareButton } from "../ProfileShareButton";

export function ProfileInstructions({
  version,
  isOwner,
  publicProfile,
}: {
  version: SetupVersion;
  isOwner: boolean;
  publicProfile: boolean;
}) {
  const router = useRouter();
  const [fileIndex, setFileIndex] = useState(
    Math.max(
      0,
      version.bundle.files.findIndex((f) => f.name.toLowerCase() === "agents.md"),
    ),
  );
  const file = version.bundle.files[fileIndex] ?? { name: "AGENTS.md", content: "" };
  const lines = file.content.replace(/\r\n?/g, "\n").split("\n");
  const [anchor, setAnchor] = useState<number | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const start = anchor === null ? 1 : Math.min(anchor, focus ?? anchor);
  const end = anchor === null ? Math.min(8, lines.length) : Math.max(anchor, focus ?? anchor);

  async function copy() {
    try {
      await navigator.clipboard.writeText(
        anchor === null ? file.content : lines.slice(start - 1, end).join("\n"),
      );
      setMessage(anchor === null ? "Instructions copied." : `Lines ${start}–${end} copied.`);
    } catch {
      setMessage("Select the text below and copy it with your browser.");
    }
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      const latest = await socialRequest<SetupDetail>(`setups/${version.setupId}`);
      if (latest.history[0]?.id !== version.id)
        throw new Error(
          "There is a newer version of this setup. Open the setup editor to review it before updating your profile.",
        );
      await socialRequest(`setups/${version.setupId}/versions`, {
        method: "POST",
        body: JSON.stringify({
          name: version.name,
          bundle: {
            ...version.bundle,
            files: version.bundle.files.map((f, index) =>
              index === fileIndex ? { ...f, content: draft } : f,
            ),
          },
          verdict: version.verdict,
          note: "Updated profile instructions.",
          publish: true,
          baseVersionId: version.id,
        }),
      });
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900"
      aria-label="Favorite agent instructions"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 p-4 sm:px-5">
        <div>
          <h3 className="text-xs uppercase tracking-widest text-zinc-500">Favorite instructions</h3>
          {version.bundle.files.length > 1 ? (
            <select
              aria-label="Instruction file"
              disabled={editing}
              value={fileIndex}
              onChange={(event) => {
                setFileIndex(Number(event.target.value));
                setAnchor(null);
                setFocus(null);
                setExpanded(false);
                setMessage("");
              }}
              className="mt-1 max-w-full bg-zinc-900 font-mono text-sm font-semibold text-zinc-100"
            >
              {version.bundle.files.map((f, index) => (
                <option key={f.name} value={index}>
                  {f.name}
                </option>
              ))}
            </select>
          ) : (
            <p className="mt-1 font-mono text-sm font-semibold">{file.name}</p>
          )}
        </div>
        {isOwner && !editing && (
          <button
            type="button"
            onClick={() => {
              setDraft(file.content);
              setEditing(true);
              setError("");
            }}
            className="rounded-lg border border-zinc-700 px-3 py-2 text-sm hover:border-rat-500 hover:text-rat-400"
          >
            Edit {file.name}
          </button>
        )}
      </div>
      {editing ? (
        <div className="space-y-3 p-4 sm:p-5">
          <label htmlFor="profile-instructions-editor" className="block text-sm text-zinc-400">
            Paste a whole file or just the lines you want on your profile.
          </label>
          <textarea
            id="profile-instructions-editor"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            disabled={busy}
            maxLength={20_000}
            rows={12}
            spellCheck={false}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 p-3 font-mono text-sm leading-6 focus:border-rat-500 focus:outline-none"
          />
          <p className="text-xs text-zinc-500">
            Saving publishes a new version on your profile. Previous versions remain in your
            history.
          </p>
          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}{" "}
              <a href={`/setups/${version.setupId}/edit`} className="underline">
                Open setup editor
              </a>
            </p>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={save}
              className="rounded-lg bg-rat-500 px-4 py-2 text-sm font-bold text-black disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save to profile"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setEditing(false)}
              className="px-3 py-2 text-sm text-zinc-400"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="px-4 pt-4 text-xs text-zinc-500 sm:px-5">
            Click a line number to select it. Shift-click another to select a range.
          </p>
          <div className="max-h-[30rem] overflow-auto py-4 font-mono text-sm leading-6">
            {lines.slice(0, expanded ? undefined : 10).map((line, index) => {
              const number = index + 1;
              const selected = anchor !== null && number >= start && number <= end;
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: line numbers identify positions in an immutable published version.
                <div key={index} className={`flex ${selected ? "bg-rat-500/10" : ""}`}>
                  <button
                    type="button"
                    aria-label={`Select line ${number}`}
                    aria-pressed={selected}
                    onClick={(event) => {
                      if (event.shiftKey && anchor !== null) setFocus(number);
                      else {
                        setAnchor(number);
                        setFocus(number);
                      }
                      setMessage("");
                    }}
                    className={`w-12 shrink-0 select-none text-right pr-3 focus-visible:outline focus-visible:outline-rat-500 ${selected ? "text-rat-400" : "text-zinc-600 hover:text-zinc-300"}`}
                  >
                    {number}
                  </button>
                  <span className="min-w-0 flex-1 whitespace-pre-wrap break-words pr-5 text-zinc-300">
                    {line || "\u00a0"}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="space-y-3 border-t border-zinc-800 p-4 sm:px-5">
            {anchor !== null && (
              <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400">
                <label>
                  From line{" "}
                  <input
                    type="number"
                    min={1}
                    max={lines.length}
                    value={start}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      if (Number.isInteger(next) && next >= 1 && next <= lines.length) {
                        setAnchor(next);
                        setFocus(Math.max(next, end));
                      }
                    }}
                    className="ml-2 w-16 rounded border border-zinc-700 bg-zinc-950 p-1.5 text-zinc-100"
                  />
                </label>
                <label>
                  Through line{" "}
                  <input
                    type="number"
                    min={start}
                    max={lines.length}
                    value={end}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      if (Number.isInteger(next) && next >= start && next <= lines.length) {
                        setAnchor(start);
                        setFocus(next);
                      }
                    }}
                    className="ml-2 w-16 rounded border border-zinc-700 bg-zinc-950 p-1.5 text-zinc-100"
                  />
                </label>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={copy}
                className="rounded-lg border border-zinc-700 px-3 py-2 text-sm hover:border-zinc-500"
              >
                {anchor === null ? "Copy instructions" : `Copy lines ${start}–${end}`}
              </button>
              <ProfileShareButton
                handle={version.handle}
                selection={{ version: version.id, file: fileIndex, start, end }}
                label={anchor === null ? "Share" : "Share selected lines"}
                publicProfile={publicProfile}
              />
              {anchor !== null && (
                <button
                  type="button"
                  onClick={() => {
                    setAnchor(null);
                    setFocus(null);
                  }}
                  className="text-xs text-zinc-400"
                >
                  Clear selection
                </button>
              )}
              {lines.length > 10 && (
                <button
                  type="button"
                  onClick={() => setExpanded(!expanded)}
                  className="text-xs text-rat-400"
                >
                  {expanded ? "Show first 10 lines" : `Show all ${lines.length} lines`}
                </button>
              )}
            </div>
            <output className="block text-xs text-zinc-400">{message}</output>
          </div>
        </>
      )}
    </section>
  );
}
