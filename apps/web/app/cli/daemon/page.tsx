import type { Metadata } from "next";
import { PrivacyFooter } from "../../../components/PrivacyFooter";
import { Wordmark } from "../../../components/ui/Wordmark.js";

export const runtime = "edge";

export const metadata: Metadata = {
  title: "Background watcher",
  description:
    "How the Token Rats background watcher works, where state lives, and how to stop it.",
};

export default function DaemonDocsPage() {
  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <a href="/" className="text-sm text-zinc-500 hover:text-zinc-300">
            &larr; Home
          </a>
          <a href="/">
            <Wordmark size="md" />
          </a>
          <div className="w-16" />
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-6 px-6 py-12 text-zinc-300">
        <h1 className="text-3xl font-bold text-zinc-100">Background watcher</h1>
        <p>
          When you run <code className="rounded bg-zinc-800 px-1.5 py-0.5">token-rats login</code>{" "}
          the CLI installs a small background process that watches your local Claude Code logs and
          uploads new sessions as soon as they appear. This is the recommended default — it means
          you don&apos;t have to remember to run{" "}
          <code className="rounded bg-zinc-800 px-1.5 py-0.5">sync</code> and it captures sessions
          before Claude Code, Cursor, or your own cleanup scripts can rotate the local logs.
        </p>
        <h2 className="text-xl font-semibold text-zinc-100">Per-platform</h2>
        <ul className="space-y-2 text-sm">
          <li>
            <strong className="text-zinc-100">macOS</strong> — a launchd LaunchAgent at{" "}
            <code className="rounded bg-zinc-800 px-1.5 py-0.5">
              ~/Library/LaunchAgents/com.tokenrats.watch.plist
            </code>
            . Logs at{" "}
            <code className="rounded bg-zinc-800 px-1.5 py-0.5">~/Library/Logs/token-rats/</code>.
          </li>
          <li>
            <strong className="text-zinc-100">Linux</strong> — a systemd user unit at{" "}
            <code className="rounded bg-zinc-800 px-1.5 py-0.5">
              ~/.config/systemd/user/token-rats-watch.service
            </code>
            . Manage with{" "}
            <code className="rounded bg-zinc-800 px-1.5 py-0.5">systemctl --user</code>.
          </li>
          <li>
            <strong className="text-zinc-100">Windows</strong> — a Scheduled Task named{" "}
            <code className="rounded bg-zinc-800 px-1.5 py-0.5">TokenRatsWatch</code>, triggered at
            user logon.
          </li>
        </ul>
        <h2 className="text-xl font-semibold text-zinc-100">Where state lives</h2>
        <ul className="space-y-2 text-sm">
          <li>
            <code className="rounded bg-zinc-800 px-1.5 py-0.5">~/.config/token-rats/token</code> —
            your auth token (mode 0600).
          </li>
          <li>
            <code className="rounded bg-zinc-800 px-1.5 py-0.5">
              ~/.config/token-rats/state.json
            </code>{" "}
            — the device id we send as{" "}
            <code className="rounded bg-zinc-800 px-1.5 py-0.5">X-Device-Id</code> on every request.
            A UUID generated on first run; never sent to the server in any other form.
          </li>
          <li>
            <code className="rounded bg-zinc-800 px-1.5 py-0.5">
              ~/.config/token-rats/devices.json
            </code>{" "}
            — your local map of <em>device id → friendly label / hostname / OS</em>. The server
            never sees this file&apos;s contents.
          </li>
          <li>
            <code className="rounded bg-zinc-800 px-1.5 py-0.5">
              ~/.config/token-rats/watch-state.json
            </code>{" "}
            — per-file watch state so restarts don&apos;t re-scan from scratch and rotation can be
            detected.
          </li>
          <li>
            <code className="rounded bg-zinc-800 px-1.5 py-0.5">
              ~/.config/token-rats/disconnected
            </code>{" "}
            — sentinel touched when the server returns{" "}
            <code className="rounded bg-zinc-800 px-1.5 py-0.5">device_revoked</code>. The daemon
            refuses to start while this file exists;{" "}
            <code className="rounded bg-zinc-800 px-1.5 py-0.5">token-rats login</code> clears it.
          </li>
        </ul>
        <h2 className="text-xl font-semibold text-zinc-100">Privacy</h2>
        <p>
          The server stores no hostname, no OS string, no machine name. Only an opaque{" "}
          <code className="rounded bg-zinc-800 px-1.5 py-0.5">device_id</code>, the user it belongs
          to, last-seen timestamps, upload counts, and the CLI version that posted last. Anything
          that looks like a friendly device label lives on the device itself.
        </p>
        <h2 className="text-xl font-semibold text-zinc-100">Stopping the daemon</h2>
        <p>From the CLI on the device:</p>
        <pre className="overflow-x-auto rounded bg-zinc-900 p-4 text-sm text-zinc-200">
          {`token-rats daemon-status      # is it running?
token-rats uninstall-daemon   # remove it
token-rats logout             # clear the token`}
        </pre>
        <p>
          From the web UI, on a different machine: open{" "}
          <a href="/app/devices" className="text-rat-400 underline">
            Your devices
          </a>{" "}
          and click <strong>Disconnect</strong>. The next ingest from that device returns 401, the
          daemon exits cleanly with a &quot;disconnected by user&quot; log line, and the device
          stays in your list with a Disconnected pill (its history is preserved). Re-running{" "}
          <code className="rounded bg-zinc-800 px-1.5 py-0.5">token-rats login</code> on the device
          re-installs the daemon and clears the sentinel.
        </p>
        <h2 className="text-xl font-semibold text-zinc-100">Opting out at install</h2>
        <p>
          <code className="rounded bg-zinc-800 px-1.5 py-0.5">token-rats login --no-daemon</code>{" "}
          skips the install. You can run{" "}
          <code className="rounded bg-zinc-800 px-1.5 py-0.5">token-rats sync</code> manually
          whenever you want.
        </p>
      </main>
      <PrivacyFooter />
    </div>
  );
}
