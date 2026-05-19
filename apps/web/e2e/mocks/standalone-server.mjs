/**
 * Standalone mock API server for the Token Rats Playwright suite.
 *
 * Boots a Node HTTP server on $MOCK_API_PORT (default 8787) and dispatches
 * every request through the msw handlers in `handlers.ts`. Because Next.js
 * server components fetch `NEXT_PUBLIC_API_URL` directly over the network,
 * this is the only way to intercept them without monkey-patching Next.
 *
 * Run with: `node --experimental-strip-types ./standalone-server.mjs`
 * Playwright's `webServer` boots this before the Next dev server.
 */

import { randomUUID } from "node:crypto";
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_API_PORT ?? 8787);

const { handlers } = await import("./handlers.ts");

/**
 * @param {import("http").IncomingMessage} req
 * @returns {Promise<Request>}
 */
async function toFetchRequest(req) {
  const url = `http://localhost:${PORT}${req.url ?? "/"}`;
  const method = req.method ?? "GET";
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) headers.set(k, v.join(","));
    else if (typeof v === "string") headers.set(k, v);
  }
  const hasBody = method !== "GET" && method !== "HEAD";
  let body;
  if (hasBody) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    body = Buffer.concat(chunks);
  }
  return new Request(url, {
    method,
    headers,
    body: hasBody && body && body.length > 0 ? body : undefined,
  });
}

/**
 * @param {Response} response
 * @param {import("http").ServerResponse} res
 */
async function writeFetchResponse(response, res) {
  /** @type {Record<string, string | string[]>} */
  const headers = {};
  // Collect duplicate set-cookie headers via getSetCookie() if available.
  if (typeof response.headers.getSetCookie === "function") {
    const cookies = response.headers.getSetCookie();
    if (cookies.length > 0) headers["set-cookie"] = cookies;
  }
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie" && headers["set-cookie"]) return;
    headers[key] = value;
  });
  res.writeHead(response.status, headers);
  if (response.body) {
    const buf = Buffer.from(await response.arrayBuffer());
    res.end(buf);
  } else {
    res.end();
  }
}

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-credentials": "true",
  "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type,cookie,authorization",
  "access-control-expose-headers": "set-cookie",
};

const server = createServer(async (req, res) => {
  try {
    const origin = req.headers.origin;
    const corsExtra = origin
      ? { ...CORS_HEADERS, "access-control-allow-origin": origin }
      : CORS_HEADERS;
    // Preflight.
    if (req.method === "OPTIONS") {
      res.writeHead(204, corsExtra);
      res.end();
      return;
    }
    const fetchRequest = await toFetchRequest(req);
    let matched = null;
    for (const handler of handlers) {
      const result = await handler.run({ request: fetchRequest, requestId: randomUUID() });
      if (result?.response) {
        matched = result.response;
        break;
      }
    }
    if (matched) {
      // Merge CORS headers into the response.
      for (const [k, v] of Object.entries(corsExtra)) {
        matched.headers.set(k, v);
      }
      await writeFetchResponse(matched, res);
    } else {
      res.writeHead(404, { "content-type": "application/json", ...corsExtra });
      res.end(JSON.stringify({ error: "not-mocked", path: req.url }));
    }
  } catch (err) {
    res.writeHead(500, { "content-type": "application/json", ...CORS_HEADERS });
    res.end(JSON.stringify({ error: String(err) }));
  }
});

server.listen(PORT, () => {
  console.log(`[mock-api] listening on http://localhost:${PORT}`);
});
