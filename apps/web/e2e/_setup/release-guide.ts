import { createHmac } from "node:crypto";
import type { APIRequestContext } from "@playwright/test";

/** The walkthrough has its own spec; existing flows start with it already seen. */
export async function skipReleaseGuide(request: APIRequestContext) {
  if (process.env.TOKEN_RATS_SOCIAL_E2E !== "1") return;
  const api = process.env.PLAYWRIGHT_API_BASE_URL ?? "http://127.0.0.1:8788";
  for (const user of ["social-alice", "social-bob"]) {
    const payload = `${user}.${Date.now() + 3600000}`;
    const token = `${payload}.${createHmac("sha256", "social-local-test-only").update(payload).digest("base64url")}`;
    const response = await request.post(`${api}/v1/releases/visit`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok()) throw new Error("Could not prepare release guide state in test database");
  }
}
