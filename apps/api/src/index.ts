import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./env.js";

const app = new Hono<{ Bindings: Env }>();

app.use(
  "*",
  cors({
    origin: (origin, c) => c.env.WEB_ORIGIN,
    credentials: true,
  }),
);

app.get("/healthz", (c) => c.json({ ok: true, ts: Date.now() }));

// Phase 1 / Track C fills in the rest of /v1/*.
app.all("/v1/*", (c) => c.json({ error: { code: "not_implemented", message: "phase 1" } }, 501));

export default app;
