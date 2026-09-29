import { AgentCapture } from "../../components/setups/AgentCapture";
export const runtime = "edge";
export const metadata = {
  title: "Let your agent save your setup",
  description:
    "A copyable skill to capture and share reproducible agent configurations in Token Rats.",
};
export default function Page() {
  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-12">
      <a href="/app" className="text-sm text-rat-400">
        ← Token Rats
      </a>
      <h1 className="text-3xl font-black">From your machine to your setup history.</h1>
      <AgentCapture />
      <ol className="space-y-6 text-sm leading-7 text-zinc-400">
        <li>
          <strong className="text-zinc-200">1. Paste the skill into your agent.</strong> Use the
          agent that can read the instructions and tool configurations you want to capture.
        </li>
        <li>
          <strong className="text-zinc-200">2. Let it assemble a reproducible version.</strong> It
          captures the selected files, roles, tools, and handoffs, removes private details, and
          writes down prerequisites and where each file belongs.
        </li>
        <li>
          <strong className="text-zinc-200">3. Open your saved setup.</strong> The agent uses your
          Token Rats login to save the bundle. You get a version link to inspect, compare, download,
          feature, or share. If you are not signed in, it guides you through a one-time login.
        </li>
      </ol>
      <p className="text-sm text-zinc-500">
        You choose when to capture and publish. Automatic detection of changes is a future option.
      </p>
      <a href="/setups/new" className="inline-block text-sm text-rat-400">
        Prefer to add files yourself? →
      </a>
    </main>
  );
}
