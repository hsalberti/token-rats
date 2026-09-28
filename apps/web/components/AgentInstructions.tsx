export function AgentInstructions({
  handle,
  preview,
  published,
}: { handle: string; preview: string; published: string | null }) {
  return (
    <section className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
      <div className="flex items-center justify-between gap-4 border-b border-zinc-800 px-5 py-3">
        <div>
          <h2 className="font-mono text-sm font-bold text-zinc-100">AGENTS.md</h2>
          <p className="mt-1 text-xs text-zinc-500">Instructions shared by @{handle}</p>
        </div>
        {published ? (
          <a
            href={`data:text/markdown;charset=utf-8,${encodeURIComponent(published)}`}
            download="AGENTS.md"
            className="text-sm text-rat-400"
          >
            Download AGENTS.md
          </a>
        ) : (
          <span className="text-xs text-zinc-500">First 10 lines</span>
        )}
      </div>
      <pre className="whitespace-pre-wrap break-words p-5 font-mono text-sm leading-6 text-zinc-300">
        {preview}
      </pre>
      {published && published !== preview && (
        <details className="px-5 pb-5">
          <summary className="cursor-pointer text-sm text-rat-400">
            Read all shared instructions
          </summary>
          <pre className="mt-4 whitespace-pre-wrap break-words font-mono text-sm leading-6 text-zinc-300">
            {published}
          </pre>
        </details>
      )}
    </section>
  );
}
