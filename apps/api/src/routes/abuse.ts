/**
 * POST /v1/abuse/report
 *
 * Accepts a report against a public handle.  The report is written to a
 * `reports` table (added in migration 0005) and also logged to console for
 * immediate visibility.
 *
 * Banlist is keyed in KV as `banned:handle:<lowercase_handle>`.
 * Moderators set those keys manually; this endpoint only collects reports.
 */

import { ReportAbuseRequest } from "@token-rats/contracts";
import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../env.js";
import { notFound, validationError } from "../lib/errors.js";
import type { AuthVariables } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";

type HonoEnv = { Bindings: Env; Variables: AuthVariables };

const abuse = new Hono<HonoEnv>();

abuse.post("/report", requireAuth, async (c) => {
  const callerId = c.var.userId;

  let body: z.infer<typeof ReportAbuseRequest>;
  try {
    const raw = await c.req.json();
    body = ReportAbuseRequest.parse(raw);
  } catch (err) {
    return validationError(c, err instanceof z.ZodError ? err.issues : String(err));
  }

  const { targetHandle, reason } = body;

  // Verify the target handle exists
  const target = await c.env.DB.prepare("SELECT id FROM users WHERE handle = ?")
    .bind(targetHandle)
    .first<{ id: string }>();

  if (!target) {
    return notFound(c, "Target user not found");
  }

  const id = crypto.randomUUID();
  const now = Date.now();

  // Let the DB error propagate — if the reports table is missing the
  // operator needs to know (apply migration 0005), not have the report
  // silently dropped into a console.warn that nobody is tailing.
  await c.env.DB.prepare(
    "INSERT INTO reports (id, reporter_id, target_handle, reason, created_at) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(id, callerId, targetHandle, reason, now)
    .run();

  return c.json({ ok: true });
});

export default abuse;
