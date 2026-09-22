import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../env.js";
import { signToken } from "../lib/auth.js";
import { testDatabase } from "../lib/test-db.js";
import type { AuthVariables } from "../middleware/auth.js";
import proxy from "./chat-proxy.js";
let setup: ReturnType<typeof testDatabase>;
let pending: Promise<unknown>[];
const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
app.route("/proxy", proxy);
beforeEach(() => {
  setup = testDatabase();
  pending = [];
});
afterEach(() => {
  setup.db.close();
  vi.unstubAllGlobals();
});
async function request(path: string, method = "GET", body?: unknown, user = "alice") {
  return app.fetch(
    new Request(`https://test/proxy${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${await signToken(user, setup.env.SESSION_SIGNING_KEY, 3600000)}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
    setup.env,
    {
      waitUntil: (promise: Promise<unknown>) => pending.push(promise),
      passThroughOnException() {},
    } as unknown as ExecutionContext,
  );
}
const reply = {
  model: "vendor/model",
  choices: [{ message: { content: "private response" } }],
  usage: {
    prompt_tokens: 200,
    completion_tokens: 50,
    prompt_tokens_details: { cached_tokens: 100, cache_write_tokens: 20 },
    completion_tokens_details: { reasoning_tokens: 30 },
  },
};
describe("Chat Completions proxy", () => {
  it("requires a per-user key and never returns the saved key", async () => {
    expect(
      (await request("/openrouter/v1/chat/completions", "POST", { model: "test" })).status,
    ).toBe(400);
    await request("/keys/openrouter", "POST", { apiKey: "provider-secret" });
    expect(await (await request("/keys/openrouter")).json()).toEqual({ stored: true });
    expect(await (await request("/keys/openrouter", "GET", undefined, "bob")).json()).toEqual({
      stored: false,
    });
    const row = setup.db.prepare("SELECT ciphertext FROM user_proxy_keys").get() as {
      ciphertext: string;
    };
    expect(row.ciphertext).not.toContain("provider-secret");
    await request("/keys/openrouter", "DELETE");
    expect(await (await request("/keys/openrouter")).json()).toEqual({ stored: false });
  });
  it.each(["openrouter", "openai"])(
    "tracks %s JSON usage without double-counting reasoning",
    async (provider) => {
      await request(`/keys/${provider}`, "POST", { apiKey: "provider-secret" });
      const upstream = vi.fn().mockResolvedValue(Response.json(reply));
      vi.stubGlobal("fetch", upstream);
      const result = await request(`/${provider}/v1/chat/completions`, "POST", {
        model: "test",
        messages: [{ role: "user", content: "private prompt" }],
      });
      expect(await result.json()).toEqual(reply);
      await Promise.all(pending);
      expect(upstream.mock.calls[0]?.[1].headers.Authorization).toBe("Bearer provider-secret");
      const stored = setup.db.prepare("SELECT * FROM sessions").get();
      expect(stored).toMatchObject({
        source: provider,
        in_tokens: 80,
        out_tokens: 50,
        cache_read_tokens: 100,
        cache_write_tokens: 20,
        reasoning_tokens: 30,
      });
      expect(JSON.stringify(stored)).not.toContain("private");
    },
  );
  it("preserves split SSE bytes and records final usage once", async () => {
    await request("/keys/openrouter", "POST", { apiKey: "key" });
    const text = `: comment\ndata: ${JSON.stringify({ choices: [{ delta: { content: "hello" } }] })}\n\ndata: ${JSON.stringify(reply)}\n\ndata: [DONE]\n\n`;
    const bytes = new TextEncoder().encode(text);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          new ReadableStream({
            start(controller) {
              for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7));
              controller.close();
            },
          }),
          { headers: { "Content-Type": "text/event-stream" } },
        ),
      ),
    );
    const result = await request("/openrouter/v1/chat/completions", "POST", {
      model: "test",
      stream: true,
    });
    expect(await result.text()).toBe(text);
    await Promise.all(pending);
    expect(setup.db.prepare("SELECT out_tokens FROM sessions").all()).toEqual([{ out_tokens: 50 }]);
  });
  it("passes upstream errors through without recording invented usage", async () => {
    await request("/keys/openrouter", "POST", { apiKey: "key" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("rate limited", { status: 429 })),
    );
    const result = await request("/openrouter/v1/chat/completions", "POST", { model: "test" });
    expect(result.status).toBe(429);
    expect(await result.text()).toBe("rate limited");
    expect(setup.db.prepare("SELECT * FROM sessions").all()).toEqual([]);
  });
});
