import { getProxyAnthropicKeyStatus, proxyKey } from "@/lib/api";
/**
 * /proxy — trust + setup page for the Anthropic API proxy mode.
 *
 * Explains exactly what the proxy does and does not do, points users to the
 * source files they can audit, and (if signed in) lets them register or clear
 * their per-user Anthropic API key.
 */
import { getCookieHeader, getSession } from "@/lib/auth";
import { ChatKey } from "./ChatKeys";
import { ProxyKeyClient } from "./Client";

export const runtime = "edge";

export const metadata = {
  title: "API Proxy — Token Rats",
  description:
    "Forward your raw Anthropic API calls through Token Rats to auto-log token usage on your leaderboard.",
};

export default async function ProxyPage() {
  const user = await getSession();

  let initialStored = false;
  if (user) {
    try {
      const cookieHeader = await getCookieHeader();
      const status = await getProxyAnthropicKeyStatus(cookieHeader);
      initialStored = status.stored;
    } catch {
      // Not critical — defaults to false
    }
  }

  const chatKeys = user
    ? await Promise.all(
        ["openrouter", "openai"].map(async (provider) =>
          proxyKey(provider, "GET", undefined, await getCookieHeader()).catch(() => ({
            stored: false,
          })),
        ),
      )
    : [];

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
      <div className="max-w-2xl mx-auto space-y-10">
        {/* Header */}
        <div>
          <a href="/" className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
            &larr; Home
          </a>
          <h1 className="mt-4 text-3xl font-bold tracking-tight">API proxy mode</h1>
          <p className="mt-2 text-zinc-400">
            Use Token Rats as a drop-in proxy for the Anthropic API. Your usage gets logged
            automatically — no prompts or completions ever touch our storage.
          </p>
        </div>

        <p className="text-sm text-zinc-400">
          Proxy requests send prompts and responses through this server to your provider. Token Rats
          stores usage metadata only. Cost values are API estimates, not invoices.
        </p>
        {user ? (
          <>
            {(["openrouter", "openai"] as const).map((provider, i) => (
              <ChatKey
                key={provider}
                provider={provider}
                initialStored={chatKeys[i]?.stored ?? false}
              />
            ))}
          </>
        ) : (
          <a href="/signin">Sign in to set up OpenRouter or OpenAI</a>
        )}
        {/* Trust section */}
        <section>
          <h2 className="text-lg font-semibold mb-3">What we do</h2>
          <ul className="space-y-2 text-sm text-zinc-300">
            <li className="flex gap-2">
              <span className="text-green-400 mt-0.5 shrink-0">✓</span>
              <span>
                Forward your request bytes to{" "}
                <code className="bg-zinc-800 px-1 rounded text-xs">
                  api.anthropic.com/v1/messages
                </code>{" "}
                unchanged.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-green-400 mt-0.5 shrink-0">✓</span>
              <span>
                Read the <code className="bg-zinc-800 px-1 rounded text-xs">usage</code> field from
                the Anthropic response (input/output token counts only).
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-green-400 mt-0.5 shrink-0">✓</span>
              <span>
                Persist a <code className="bg-zinc-800 px-1 rounded text-xs">SessionRecord</code>{" "}
                with those counts into your leaderboard totals.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-green-400 mt-0.5 shrink-0">✓</span>
              <span>
                Return the upstream response to your client — same status, same headers, same body.
              </span>
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">What we never do</h2>
          <ul className="space-y-2 text-sm text-zinc-300">
            <li className="flex gap-2">
              <span className="text-red-400 mt-0.5 shrink-0">✗</span>
              <span>Log or store prompt or completion content.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-red-400 mt-0.5 shrink-0">✗</span>
              <span>
                Store your Anthropic API key in plaintext — it is encrypted with AES-256-GCM before
                it touches our database.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-red-400 mt-0.5 shrink-0">✗</span>
              <span>Return your Anthropic API key via any API call, even to you.</span>
            </li>
          </ul>
        </section>

        {/* Audit links */}
        <section>
          <h2 className="text-lg font-semibold mb-3">Audit the code yourself</h2>
          <p className="text-sm text-zinc-400 mb-3">
            The proxy implementation is open source. These are the exact files that handle your
            traffic:
          </p>
          <ul className="space-y-1 text-sm font-mono text-zinc-300">
            <li>
              <code className="bg-zinc-800 px-2 py-0.5 rounded text-xs">
                apps/api/src/routes/proxy.ts
              </code>
              <span className="text-zinc-500 ml-2 font-sans text-xs">
                — proxy + key management routes
              </span>
            </li>
            <li>
              <code className="bg-zinc-800 px-2 py-0.5 rounded text-xs">
                apps/api/src/lib/ingest.ts
              </code>
              <span className="text-zinc-500 ml-2 font-sans text-xs">
                — session persistence (counts only)
              </span>
            </li>
            <li>
              <code className="bg-zinc-800 px-2 py-0.5 rounded text-xs">
                infra/migrations/0004_proxy_keys.sql
              </code>
              <span className="text-zinc-500 ml-2 font-sans text-xs">
                — user_anthropic_keys table schema
              </span>
            </li>
          </ul>
        </section>

        {/* Setup instructions */}
        <section>
          <h2 className="text-lg font-semibold mb-3">How to use it</h2>
          <p className="text-sm text-zinc-400 mb-3">
            Point your Anthropic SDK at the Token Rats proxy by setting:
          </p>
          <pre className="bg-zinc-800 border border-zinc-700 rounded-md p-4 text-sm overflow-x-auto">
            <code className="text-zinc-100">
              {`ANTHROPIC_BASE_URL=https://api.tokenrats.com/v1/proxy/anthropic
ANTHROPIC_API_KEY=<your Token Rats user token>`}
            </code>
          </pre>
          <p className="mt-3 text-xs text-zinc-500">
            The <code className="bg-zinc-800 px-1 rounded">ANTHROPIC_API_KEY</code> value here is
            your Token Rats Bearer token (from the CLI login), not your Anthropic key. Your
            Anthropic key is stored separately using the form below and sent directly to Anthropic —
            it never appears in application logs.
          </p>
        </section>

        {/* Key management */}
        <section>
          <h2 className="text-lg font-semibold mb-1">
            {user ? "Your Anthropic API key" : "Sign in to manage your key"}
          </h2>
          {user ? (
            <>
              <p className="text-sm text-zinc-400 mb-4">
                We&apos;ll use this key for all proxy requests from your account. You can also leave
                it empty to use a shared key if one is configured.
              </p>
              <ProxyKeyClient initialStored={initialStored} />
            </>
          ) : (
            <p className="text-sm text-zinc-400">
              <a href="/signin" className="text-zinc-100 underline hover:no-underline">
                Sign in with GitHub
              </a>{" "}
              to store a per-user Anthropic API key.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
