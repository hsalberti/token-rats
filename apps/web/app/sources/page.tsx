export const runtime = "edge";

export const metadata = {
  title: "Local sources — Token Rats",
  description: "Track Claude Code, Codex, OpenCode, and Cursor from local usage files.",
};

export default function SourcesPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-10 text-zinc-100">
      <a href="/app" className="text-rat-400">
        ← Token Rats
      </a>
      <div className="space-y-3">
        <h1 className="text-3xl font-bold">Track local usage</h1>
        <p className="text-zinc-400">
          The Token Rats CLI reads usage fields from files already written by your coding tools. It
          uploads token counts, model and provider names, session times, and opaque IDs.
        </p>
      </div>
      <pre className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900 p-5 text-sm">{`npx token-rats sync --dry-run
npx token-rats login
npx token-rats sync`}</pre>
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Supported sources</h2>
        <ul className="space-y-3 text-sm text-zinc-300">
          <li>
            <strong>Claude Code:</strong> local project JSONL files; reported token counts.
          </li>
          <li>
            <strong>Codex:</strong> local rollout JSONL files; reported token counts.
          </li>
          <li>
            <strong>OpenCode:</strong> local SQLite database, including current WAL data; reported
            token counts grouped by model.
          </li>
          <li>
            <strong>Cursor:</strong> local generation records; token counts are estimates.
          </li>
        </ul>
      </div>
      <p className="text-sm text-zinc-400">
        OpenCode uses <code>~/.local/share/opencode/opencode.db</code> by default. The collector
        also checks <code>OPENCODE_DB</code>, <code>OPENCODE_DATA_DIR</code>, and{" "}
        <code>XDG_DATA_HOME</code>. It reads only usage fields from assistant message records. Your
        prompts, responses, and AGENTS.md files are not uploaded by sync.
      </p>
      <p className="text-sm text-zinc-400">
        The collector source and counting limits are public:{" "}
        <a
          className="text-rat-400"
          href="https://github.com/hsalberti/token-rats/blob/main/packages/cli/src/lib/opencode-extract.ts"
        >
          OpenCode reader
        </a>
        {" · "}
        <a
          className="text-rat-400"
          href="https://github.com/hsalberti/token-rats/blob/main/docs/counting.md"
        >
          counting method
        </a>
        .
      </p>
    </main>
  );
}
