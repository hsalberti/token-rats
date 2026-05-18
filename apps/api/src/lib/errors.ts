/**
 * Typed JSON error helpers for the Worker API.
 *
 * Functions accept any Hono Context to avoid type-widening conflicts when
 * routes attach Variables to the context (e.g. AuthVariables).
 */
import type { Context } from "hono";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCtx = Context<any, any, any>;

function apiError(
  c: AnyCtx,
  status: 400 | 401 | 403 | 404 | 409 | 410 | 429 | 500 | 501,
  code: string,
  message: string,
  details?: unknown,
) {
  return c.json(
    {
      error: {
        code,
        message,
        ...(details !== undefined ? { details } : {}),
      },
    },
    status,
  );
}

export function validationError(c: AnyCtx, details: unknown) {
  return apiError(c, 400, "validation_error", "Request validation failed", details);
}

export function authRequired(c: AnyCtx) {
  return apiError(c, 401, "auth_required", "Authentication required");
}

export function forbidden(c: AnyCtx, message = "Forbidden") {
  return apiError(c, 403, "forbidden", message);
}

export function notFound(c: AnyCtx, message = "Not found") {
  return apiError(c, 404, "not_found", message);
}

export function gone(c: AnyCtx, message = "Resource expired or already used") {
  return apiError(c, 410, "gone", message);
}

export function rateLimited(c: AnyCtx) {
  return apiError(c, 429, "rate_limited", "Too many requests");
}

export function internalError(c: AnyCtx, message = "Internal server error") {
  return apiError(c, 500, "internal_error", message);
}
