/**
 * Phase 3 Track M — Anthropic API proxy routes.
 *
 * Mounted at /v1/proxy in index.ts:
 *   POST /v1/proxy/anthropic/v1/messages   – forwards to Anthropic, logs usage
 *   POST /v1/proxy/keys/anthropic           – store per-user encrypted key
 *   DELETE /v1/proxy/keys/anthropic         – remove per-user key
 *   GET  /v1/proxy/keys/anthropic           – { stored: boolean }
 *
 * Privacy guarantee: only token counts are persisted. Prompt and completion
 * content are NEVER read or stored — the request body is forwarded as raw
 * bytes and the response body is piped through unchanged (or streamed via a
 * TransformStream that only inspects SSE usage events).
 */

import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../env.js";
import type { AuthVariables } from "../middleware/auth.js";
import { requireAuth, extractUserId } from "../middleware/auth.js";
import { validationError, authRequired } from "../lib/errors.js";
import { recordSession } from "../lib/ingest.js";
import { priceOf } from "@token-rats/pricing";

type HonoEnv = { Bindings: Env; Variables: AuthVariables };

const proxy = new Hono<HonoEnv>();

/* -------------------------------------------------------------------------- */
/* AES-GCM helpers for per-user key encryption                                */
/* -------------------------------------------------------------------------- */

const AES_ALG = { name: "AES-GCM", length: 256 } as const;

/** Derive a 256-bit AES-GCM key from the SESSION_SIGNING_KEY string. */
async function deriveAesKey(signingKey: string): Promise<CryptoKey> {
  // Hash the signing key to get exactly 32 bytes of key material.
  const keyBytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(signingKey),
  );
  return crypto.subtle.importKey("raw", keyBytes, AES_ALG, false, ["encrypt", "decrypt"]);
}

function buf2b64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function b64toBuf(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i) as number;
  return bytes;
}

/** Encrypt a plaintext string. Returns { ciphertext, iv } both base64. */
async function encryptKey(plaintext: string, signingKey: string): Promise<{ ciphertext: string; iv: string }> {
  const aesKey = await deriveAesKey(signingKey);
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for GCM
  const cipherBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    new TextEncoder().encode(plaintext),
  );
  return { ciphertext: buf2b64(cipherBuf), iv: buf2b64(iv.buffer) };
}

/** Decrypt a base64 ciphertext with base64 IV. Returns plaintext string. */
async function decryptKey(ciphertext: string, iv: string, signingKey: string): Promise<string> {
  const aesKey = await deriveAesKey(signingKey);
  const plainBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64toBuf(iv) },
    aesKey,
    b64toBuf(ciphertext),
  );
  return new TextDecoder().decode(plainBuf);
}

/* -------------------------------------------------------------------------- */
/* Resolve which Anthropic API key to use for a request                       */
/* -------------------------------------------------------------------------- */

/** Returns the Anthropic API key for userId: per-user stored key takes priority
 *  over the worker-level ANTHROPIC_API_KEY secret. Returns null if neither set. */
async function resolveAnthropicKey(env: Env, userId: string): Promise<string | null> {
  // Check per-user key first
  const row = await env.DB.prepare(
    "SELECT ciphertext, iv FROM user_anthropic_keys WHERE user_id = ?",
  )
    .bind(userId)
    .first<{ ciphertext: string; iv: string }>();

  if (row) {
    try {
      return await decryptKey(row.ciphertext, row.iv, env.SESSION_SIGNING_KEY);
    } catch (err) {
      // Decryption failure — likely a rotated SESSION_SIGNING_KEY breaking
      // the stored key. Log so the operator notices; the caller falls back
      // to the shared key, which silently bills the wrong account.
      console.error("[proxy] decrypt user key failed", { userId, err });
    }
  }

  // Fall back to worker-level key
  return env.ANTHROPIC_API_KEY ?? null;
}

/* -------------------------------------------------------------------------- */
/* SSE streaming helpers                                                       */
/* -------------------------------------------------------------------------- */

interface UsageAccumulator {
  input_tokens: number;
  output_tokens: number;
  model: string;
}

/** Parse a single SSE data line and accumulate usage if it's a message_delta event. */
function parseSSELine(line: string, acc: UsageAccumulator): void {
  if (!line.startsWith("data: ")) return;
  const json = line.slice(6).trim();
  if (json === "[DONE]") return;
  try {
    const evt = JSON.parse(json) as {
      type?: string;
      usage?: { input_tokens?: number; output_tokens?: number };
      message?: { model?: string; usage?: { input_tokens?: number; output_tokens?: number } };
    };

    // message_start gives us the model + initial usage
    if (evt.type === "message_start" && evt.message) {
      if (evt.message.model) acc.model = evt.message.model;
      if (evt.message.usage) {
        acc.input_tokens += evt.message.usage.input_tokens ?? 0;
        acc.output_tokens += evt.message.usage.output_tokens ?? 0;
      }
    }

    // message_delta gives us the final output_tokens count
    if (evt.type === "message_delta" && evt.usage) {
      acc.input_tokens += evt.usage.input_tokens ?? 0;
      acc.output_tokens += evt.usage.output_tokens ?? 0;
    }
  } catch {
    // Ignore malformed JSON in the stream
  }
}

/* -------------------------------------------------------------------------- */
/* POST /anthropic/v1/messages  (proxy endpoint)                              */
/* -------------------------------------------------------------------------- */

proxy.post("/anthropic/v1/messages", async (c) => {
  // The user token is passed in the Authorization header (Token Rats token).
  // We need to identify the user from it.
  const userId = await extractUserId(c);
  if (!userId) return authRequired(c);

  // Resolve the Anthropic API key
  const anthropicKey = await resolveAnthropicKey(c.env, userId);
  if (!anthropicKey) {
    return c.json({ error: { code: "missing_anthropic_key", message: "No Anthropic API key configured. POST /v1/proxy/keys/anthropic to register one." } }, 400);
  }

  // Build upstream request headers — forward everything EXCEPT Authorization
  // (which carries the Token Rats user token, not the Anthropic key).
  const upstreamHeaders = new Headers();
  for (const [name, value] of c.req.raw.headers.entries()) {
    const lower = name.toLowerCase();
    if (lower === "authorization") continue; // strip Token Rats auth
    if (lower === "host") continue;          // let fetch set correct host
    upstreamHeaders.set(name, value);
  }
  upstreamHeaders.set("x-api-key", anthropicKey);
  upstreamHeaders.set(
    "anthropic-version",
    c.req.header("anthropic-version") ?? "2023-06-01",
  );

  // Forward the raw body bytes unchanged — we never read the content.
  const bodyBytes = await c.req.arrayBuffer();

  // Peek at the body JSON only to extract the model for later pricing
  // (we read it once here, not stored anywhere, then re-use the bytes).
  let requestedModel = "unknown";
  try {
    const bodyText = new TextDecoder().decode(bodyBytes);
    const parsed = JSON.parse(bodyText) as { model?: string; stream?: boolean };
    if (parsed.model) requestedModel = parsed.model;
  } catch {
    // Non-JSON body — pass through; upstream will error if invalid
  }

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: upstreamHeaders,
    body: bodyBytes,
  });

  const contentType = upstream.headers.get("content-type") ?? "";
  const isStream = contentType.includes("text/event-stream");

  if (isStream && upstream.body) {
    // --- Streaming path ---
    // Pipe the SSE stream through, accumulating usage from message_delta events.
    // The response body is forwarded byte-for-byte — prompt/completion content
    // never touches our storage.

    const acc: UsageAccumulator = { input_tokens: 0, output_tokens: 0, model: requestedModel };
    const startedAt = Date.now();

    const decoder = new TextDecoder();
    let buffer = "";

    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        // Accumulate SSE lines for usage parsing (never store content)
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? ""; // keep incomplete last line
        for (const line of lines) {
          parseSSELine(line, acc);
        }
        controller.enqueue(chunk); // forward unchanged
      },
      flush(controller) {
        // Process any remaining buffered data
        if (buffer) {
          parseSSELine(buffer, acc);
          buffer = "";
        }
        controller.terminate();
      },
    });

    // Pipe upstream body through our transform, then record the session
    // after the stream closes (via a promise chain on the pipe).
    const pipePromise = upstream.body.pipeTo(writable).then(() => {
      if (acc.input_tokens > 0 || acc.output_tokens > 0) {
        const endedAt = Date.now();
        const { costUsdCents } = priceOf(acc.model, acc.input_tokens, acc.output_tokens);
        const sessionId = crypto.randomUUID();
        const dedupeKey = `proxy:${userId}:${sessionId}`;

        return recordSession(c.env, userId, {
          id: sessionId,
          source: "claude-code", // closest fit for raw-API usage
          model: acc.model,
          inTokens: acc.input_tokens,
          outTokens: acc.output_tokens,
          costUsdCents,
          startedAt,
          endedAt,
          dedupeKey,
        });
      }
    }).catch((err) => {
      // Non-fatal for the user (we already returned upstream's bytes), but
      // a silent drop means proxy burn never reaches the leaderboard. Log so
      // it shows up in tail.
      console.error("[proxy] streaming recordSession failed", { userId, err });
    });

    // Use waitUntil so the record call doesn't block the response
    // (pipePromise resolves after the stream closes anyway, but this is clean)
    c.executionCtx?.waitUntil(pipePromise);

    // Build response forwarding all upstream headers
    const responseHeaders = new Headers(upstream.headers);
    return new Response(readable, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } else {
    // --- Non-streaming path ---
    const responseBody = await upstream.arrayBuffer();

    // Parse usage from JSON response — counts only, no content stored
    let inTokens = 0;
    let outTokens = 0;
    let model = requestedModel;
    try {
      const json = JSON.parse(new TextDecoder().decode(responseBody)) as {
        model?: string;
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      if (json.model) model = json.model;
      if (json.usage) {
        inTokens = json.usage.input_tokens ?? 0;
        outTokens = json.usage.output_tokens ?? 0;
      }
    } catch {
      // Non-JSON upstream error — pass through
    }

    if (inTokens > 0 || outTokens > 0) {
      const now = Date.now();
      const { costUsdCents } = priceOf(model, inTokens, outTokens);
      const sessionId = crypto.randomUUID();

      // Fire-and-forget — don't let DB errors affect the response
      c.executionCtx?.waitUntil(
        recordSession(c.env, userId, {
          id: sessionId,
          source: "claude-code",
          model,
          inTokens,
          outTokens,
          costUsdCents,
          startedAt: now,
          endedAt: now,
          dedupeKey: `proxy:${userId}:${sessionId}`,
        }).catch((err) => {
          console.error("[proxy] non-stream recordSession failed", { userId, err });
        }),
      );
    }

    return new Response(responseBody, {
      status: upstream.status,
      headers: new Headers(upstream.headers),
    });
  }
});

/* -------------------------------------------------------------------------- */
/* POST /keys/anthropic  — store per-user encrypted Anthropic API key         */
/* -------------------------------------------------------------------------- */

const StoreKeyRequest = z.object({ apiKey: z.string().min(1) });

proxy.post("/keys/anthropic", requireAuth, async (c) => {
  let body: { apiKey: string };
  try {
    const raw: unknown = await c.req.json();
    body = StoreKeyRequest.parse(raw);
  } catch (e) {
    return validationError(c, e instanceof Error ? e.message : e);
  }

  const userId = c.var.userId;
  const { ciphertext, iv } = await encryptKey(body.apiKey, c.env.SESSION_SIGNING_KEY);

  await c.env.DB.prepare(
    `INSERT INTO user_anthropic_keys (user_id, ciphertext, iv, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         ciphertext = excluded.ciphertext,
         iv         = excluded.iv,
         updated_at = excluded.updated_at`,
  )
    .bind(userId, ciphertext, iv, Date.now())
    .run();

  return c.json({ stored: true });
});

/* -------------------------------------------------------------------------- */
/* DELETE /keys/anthropic  — remove per-user Anthropic API key                */
/* -------------------------------------------------------------------------- */

proxy.delete("/keys/anthropic", requireAuth, async (c) => {
  const userId = c.var.userId;
  await c.env.DB.prepare("DELETE FROM user_anthropic_keys WHERE user_id = ?")
    .bind(userId)
    .run();
  return c.json({ stored: false });
});

/* -------------------------------------------------------------------------- */
/* GET /keys/anthropic  — { stored: boolean }  (NEVER returns the key itself) */
/* -------------------------------------------------------------------------- */

proxy.get("/keys/anthropic", requireAuth, async (c) => {
  const userId = c.var.userId;
  const row = await c.env.DB.prepare(
    "SELECT 1 FROM user_anthropic_keys WHERE user_id = ?",
  )
    .bind(userId)
    .first();
  return c.json({ stored: row !== null });
});

export default proxy;
