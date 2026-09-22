import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../env.js";
import { type ChatCounts, readChatUsage } from "../lib/chat-usage.js";
import { validationError } from "../lib/errors.js";
import { recordSession, toUtcDay } from "../lib/ingest.js";
import { priceOf } from "../lib/pricing.js";
import { type AuthVariables, requireAuth } from "../middleware/auth.js";
import { decryptKey, encryptKey } from "./proxy.js";

const proxy = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
const KeyRequest = z.object({ apiKey: z.string().trim().min(1).max(1000) });
const Body = z
  .object({
    model: z.string().min(1).max(128),
    stream: z.boolean().optional(),
    stream_options: z.record(z.unknown()).optional(),
  })
  .passthrough();
for (const provider of ["openrouter", "openai"] as const) {
  const keyPath = `/keys/${provider}`;
  proxy.get(keyPath, requireAuth, async (c) => {
    const row = await c.env.DB.prepare(
      "SELECT 1 FROM user_proxy_keys WHERE user_id = ? AND provider = ?",
    )
      .bind(c.var.userId, provider)
      .first();
    return c.json({ stored: row !== null });
  });
  proxy.post(keyPath, requireAuth, async (c) => {
    const parsed = KeyRequest.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationError(c, parsed.error.message);
    const { ciphertext, iv } = await encryptKey(parsed.data.apiKey, c.env.SESSION_SIGNING_KEY);
    await c.env.DB.prepare(`INSERT INTO user_proxy_keys (user_id, provider, ciphertext, iv, updated_at)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, provider) DO UPDATE SET
      ciphertext = excluded.ciphertext, iv = excluded.iv, updated_at = excluded.updated_at`)
      .bind(c.var.userId, provider, ciphertext, iv, Date.now())
      .run();
    return c.json({ stored: true });
  });
  proxy.delete(keyPath, requireAuth, async (c) => {
    await c.env.DB.prepare("DELETE FROM user_proxy_keys WHERE user_id = ? AND provider = ?")
      .bind(c.var.userId, provider)
      .run();
    return c.json({ stored: false });
  });
  proxy.post(`/${provider}/v1/chat/completions`, requireAuth, async (c) => {
    const parsed = Body.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationError(c, parsed.error.message);
    const key = await c.env.DB.prepare(
      "SELECT ciphertext, iv FROM user_proxy_keys WHERE user_id = ? AND provider = ?",
    )
      .bind(c.var.userId, provider)
      .first<{ ciphertext: string; iv: string }>();
    if (!key) return c.json({ error: "missing_provider_key" }, 400);
    const apiKey = await decryptKey(key.ciphertext, key.iv, c.env.SESSION_SIGNING_KEY);
    const body = parsed.data;
    if (body.stream) body.stream_options = { ...body.stream_options, include_usage: true };
    const startedAt = Date.now();
    const upstream = await fetch(
      provider === "openrouter"
        ? "https://openrouter.ai/api/v1/chat/completions"
        : "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    if (!upstream.ok)
      return new Response(upstream.body, { status: upstream.status, headers: upstream.headers });
    const persist = async (usage: ChatCounts | null) => {
      if (!usage) return;
      const price = await priceOf(
        c.env,
        usage.model,
        toUtcDay(startedAt),
        usage.input,
        usage.output,
        usage.cacheRead,
        usage.cacheWrite,
      );
      const id = crypto.randomUUID();
      await recordSession(c.env, c.var.userId, {
        id,
        source: provider,
        provider,
        client: "token-rats-proxy",
        channel: "proxy",
        model: usage.model,
        inTokens: usage.input,
        outTokens: usage.output,
        cacheReadTokens: usage.cacheRead,
        cacheWriteTokens: usage.cacheWrite,
        reasoningTokens: usage.reasoning,
        costUsdCents: price.costUsdCents,
        startedAt,
        endedAt: Date.now(),
        dedupeKey: `proxy:${id}`,
      });
    };
    const reportError = (err: unknown) =>
      console.error("[chat-proxy] usage persistence failed", err);
    if (upstream.headers.get("content-type")?.includes("text/event-stream") && upstream.body) {
      let buffer = "";
      let usage: ChatCounts | null = null;
      const decoder = new TextDecoder();
      const line = (value: string) => {
        if (!value.startsWith("data:")) return;
        try {
          usage = readChatUsage(JSON.parse(value.slice(5).trim()), body.model) ?? usage;
        } catch {
          /* SSE comments and DONE have no usage. */
        }
      };
      const transform = new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          buffer += decoder.decode(chunk, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const value of lines) line(value);
          controller.enqueue(chunk);
        },
        flush() {
          line(buffer + decoder.decode());
        },
      });
      c.executionCtx.waitUntil(
        upstream.body
          .pipeTo(transform.writable)
          .then(() => persist(usage))
          .catch(reportError),
      );
      return new Response(transform.readable, {
        status: upstream.status,
        headers: upstream.headers,
      });
    }
    const bytes = await upstream.arrayBuffer();
    let usage: ChatCounts | null = null;
    try {
      usage = readChatUsage(JSON.parse(new TextDecoder().decode(bytes)), body.model);
    } catch {
      /* Pass through non-JSON responses. */
    }
    c.executionCtx.waitUntil(persist(usage).catch(reportError));
    return new Response(bytes, { status: upstream.status, headers: upstream.headers });
  });
}
export default proxy;
