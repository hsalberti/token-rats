"use client";
import { SaveSetupVersion as SaveSetupSchema } from "@token-rats/contracts";
import type { SetupBundle, SetupVersion } from "@token-rats/contracts";
import { useEffect, useState } from "react";
import { socialRequest } from "../../lib/social";
const field =
  "appearance-none text-zinc-100 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-base sm:text-sm focus:border-rat-500 focus:outline-none";
export function SetupEditor({
  initial,
  baseVersionId,
  onCancel,
}: { initial?: SetupVersion; baseVersionId?: string; onCancel?: () => void }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [name, setName] = useState(initial?.name ?? "");
  const [bundle, setBundle] = useState<SetupBundle>(
    initial?.bundle ?? {
      files: [{ name: "AGENTS.md", content: "" }],
      workflow: "",
      tools: "",
      models: "",
      subscriptions: "",
    },
  );
  const [note, setNote] = useState("");
  const [verdict, setVerdict] = useState<SetupVersion["verdict"]>(initial?.verdict ?? "experiment");
  const [publish, setPublish] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await socialRequest<{ id: string; versionId: string }>(
        initial ? `setups/${initial.setupId}/versions` : "setups",
        {
          method: "POST",
          body: JSON.stringify({
            name,
            bundle,
            note,
            verdict,
            publish,
            baseVersionId: baseVersionId ?? null,
          }),
        },
      );
      window.location.assign(`/setups/${r.id}?v=${r.versionId}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  async function importFiles(files: FileList | null) {
    if (!files) return;
    try {
      if (files.length === 1 && files[0]?.name.endsWith(".json")) {
        const raw = await files[0].text();
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {}
        if (parsed && typeof parsed === "object" && "bundle" in parsed) {
          const snapshot = SaveSetupSchema.parse(parsed);
          setName(snapshot.name);
          setBundle(snapshot.bundle);
          setNote(snapshot.note);
          setVerdict(snapshot.verdict);
          setPublish(false);
          return;
        }
      }
      const incoming = await Promise.all(
        Array.from(files).map(async (f) => {
          if (f.size > 80000) throw new Error("Each text file must be under 80 KB.");
          return { name: f.name, content: await f.text() };
        }),
      );
      const next = [...bundle.files];
      for (const f of incoming) {
        const i = next.findIndex((x) => x.name === f.name);
        if (i >= 0) next[i] = f;
        else next.push(f);
      }
      setBundle({ ...bundle, files: next });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <form
      onSubmit={save}
      className="space-y-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-5 sm:p-7"
    >
      <fieldset disabled={!ready || busy} className="min-w-0 space-y-6">
        <div>
          <h2 className="text-xl font-bold">
            {initial ? "Save the next version" : "Start a setup history"}
          </h2>
          <p className="mt-2 text-sm text-zinc-400">
            Keep what you tried, including what you stopped using. Paste a whole file or just the
            part you want to keep.
          </p>
        </div>
        <label className="block text-sm">
          Setup name
          <input
            required
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`${field} mt-2`}
            placeholder="Everyday coding"
          />
        </label>
        <div className="space-y-4">
          {bundle.files.map((f, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: editable filenames cannot serve as stable input keys.
            <div key={i} className="rounded-xl border border-zinc-800 p-4">
              <div className="mb-3 flex gap-3">
                <label className="flex-1 text-xs text-zinc-400">
                  File name
                  <input
                    aria-label={`File name ${i + 1}`}
                    value={f.name}
                    onChange={(e) =>
                      setBundle({
                        ...bundle,
                        files: bundle.files.map((x, j) =>
                          j === i ? { ...x, name: e.target.value } : x,
                        ),
                      })
                    }
                    className={`${field} mt-1`}
                  />
                </label>
                {bundle.files.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      setBundle({ ...bundle, files: bundle.files.filter((_, j) => j !== i) })
                    }
                    className="text-xs text-zinc-400"
                  >
                    Remove
                  </button>
                )}
              </div>
              <textarea
                aria-label={`Contents of ${f.name}`}
                value={f.content}
                rows={10}
                maxLength={20000}
                onChange={(e) =>
                  setBundle({
                    ...bundle,
                    files: bundle.files.map((x, j) =>
                      j === i ? { ...x, content: e.target.value } : x,
                    ),
                  })
                }
                className={`${field} font-mono leading-6`}
                spellCheck={false}
              />
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              disabled={bundle.files.length >= 10}
              className="text-sm text-rat-400"
              onClick={() =>
                setBundle({
                  ...bundle,
                  files: [
                    ...bundle.files,
                    { name: `instructions-${bundle.files.length + 1}.md`, content: "" },
                  ],
                })
              }
            >
              + Add file
            </button>
            <label className="text-sm text-zinc-400">
              Import files or a saved setup
              <input
                type="file"
                multiple
                accept=".md,.txt,.json,.yaml,.yml,.toml"
                onChange={(e) => importFiles(e.target.files)}
                className="mt-2 block max-w-full text-xs"
              />
            </label>
          </div>
        </div>
        {(
          [
            [
              "workflow",
              "How your agents and apps work together",
              "Roles, handoffs, and links to custom handlers",
            ],
            ["tools", "Favorite tools", "Paseo, Orca, your own handler and its repository URL"],
            ["models", "Agents and models", "Which models you use for which roles"],
            [
              "subscriptions",
              "Subscriptions you choose to share",
              "Plan names; add prices only if you want them visible",
            ],
          ] as const
        ).map(([key, label, placeholder]) => (
          <label key={key} className="block text-sm">
            {label}
            <textarea
              value={bundle[key]}
              onChange={(e) => setBundle({ ...bundle, [key]: e.target.value })}
              rows={key === "workflow" ? 4 : 2}
              maxLength={key === "workflow" ? 5000 : 2000}
              placeholder={placeholder}
              className={`${field} mt-2`}
            />
          </label>
        ))}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            Where this setup stands
            <select
              value={verdict}
              onChange={(e) => setVerdict(e.target.value as typeof verdict)}
              className={`${field} mt-2`}
            >
              <option value="experiment">Trying it out</option>
              <option value="using">Currently using</option>
              <option value="retired">Moved on</option>
            </select>
          </label>
          <p className="self-end text-xs leading-5 text-zinc-500">
            A version is a snapshot. You can return to it, compare it, or restore it later.
          </p>
        </div>
        <label className="block text-sm">
          What changed, or why did you move on?
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={2000}
            rows={3}
            placeholder="A short note for future you and anyone who tries it."
            className={`${field} mt-2`}
          />
        </label>
        <label className="flex items-start gap-3 rounded-xl border border-zinc-700 p-4 text-sm">
          <input
            type="checkbox"
            checked={publish}
            onChange={(e) => setPublish(e.target.checked)}
            className="mt-1 h-4 w-4 shrink-0"
          />
          <span>
            <span>Share this version publicly</span>
            <span className="mt-1 block text-xs leading-5 text-zinc-400">
              All text above will be visible, downloadable, and shared with followers. Review the
              files first. Leave unchecked to save privately.
            </span>
          </span>
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}{" "}
            <a href="/settings/profile" className="underline">
              Profile settings
            </a>
          </p>
        )}
        <div className="flex gap-4">
          <button
            type="submit"
            disabled={!ready || busy}
            className="rounded-lg bg-rat-500 px-5 py-2.5 font-bold text-black disabled:opacity-50"
          >
            {busy ? "Saving…" : publish ? "Save and share version" : "Save private version"}
          </button>
          {onCancel && (
            <button type="button" onClick={onCancel} className="text-sm text-zinc-400">
              Cancel
            </button>
          )}
        </div>
      </fieldset>
    </form>
  );
}
