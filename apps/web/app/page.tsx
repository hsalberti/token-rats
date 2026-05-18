export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-8 p-8 text-center">
      <h1 className="text-5xl font-bold tracking-tight">
        Token <span className="text-rat-500">Rats</span>
      </h1>
      <p className="max-w-md text-lg text-zinc-300">
        Gym rats for token tracking with friends. Auto-sync your Claude Code + Cursor token burn to a
        leaderboard with your crew.
      </p>
      <pre className="rounded-lg bg-zinc-900 px-4 py-3 font-mono text-sm">npx token-rats sync</pre>
      <p className="text-sm text-zinc-500">Phase 0 landing. Real UI ships in Phase 1.</p>
    </main>
  );
}
