import type { Metadata } from "next";
import { AUTH_GITHUB_START } from "../../lib/api";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to Token Rats with GitHub.",
};

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-black tracking-tight">
            Token <span className="text-rat-500">Rats</span>
          </h1>
          <p className="mt-2 text-zinc-400">Strava for AI token burn.</p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
          <div className="p-8">
            <h2 className="mb-2 text-xl font-bold">Welcome back</h2>
            <p className="mb-6 text-sm text-zinc-400">
              Sign in to see your leaderboards, manage rooms, and track your
              token burn with friends.
            </p>

            <a
              href={AUTH_GITHUB_START}
              className="flex w-full items-center justify-center gap-3 rounded-xl bg-zinc-100 px-6 py-3.5 text-base font-bold text-zinc-900 transition-colors hover:bg-white active:bg-zinc-200"
            >
              <GitHubIcon />
              Sign in with GitHub
            </a>
          </div>

          <div className="border-t border-zinc-800 px-8 py-4">
            <p className="text-center text-xs text-zinc-600">
              We only read your public GitHub profile. We literally can&apos;t
              read your prompts.
            </p>
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-zinc-600">
          No account?{" "}
          <a href={AUTH_GITHUB_START} className="text-rat-400 hover:text-rat-300">
            Signing in creates one.
          </a>
        </p>
      </div>
    </div>
  );
}

function GitHubIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0 0 22 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}
