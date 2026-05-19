/**
 * Thin API client for the taskbar app. Mirrors `packages/cli/src/lib/api.ts`,
 * but uses the browser `fetch` (the taskbar runs in a Tauri webview).
 *
 * No retry logic for v1.2 — Tauri's webview handles the network and
 * surface-level errors are shown in the popover.
 */

import type { GetMeResponse, UploadSessionsResponse } from "@token-rats/contracts";
import { ENDPOINTS } from "@token-rats/contracts";

const DEFAULT_API_URL = "https://api.tokenrats.com";

export interface ApiClientOptions {
  apiUrl?: string;
  token?: string | null;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`API error ${status}: ${body}`);
    this.name = "ApiError";
  }
}

export class ApiClient {
  private readonly apiUrl: string;
  private token: string | null;

  constructor(opts: ApiClientOptions = {}) {
    const envUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? undefined;
    this.apiUrl = (opts.apiUrl ?? envUrl ?? DEFAULT_API_URL).replace(/\/$/, "");
    this.token = opts.token ?? null;
  }

  setToken(token: string | null): void {
    this.token = token;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.token) {
      h["Authorization"] = `Bearer ${this.token}`;
    }
    return h;
  }

  async cliExchange(): Promise<{
    verificationUrl: string;
    pollToken: string;
    expiresIn: number;
  }> {
    const res = await fetch(`${this.apiUrl}${ENDPOINTS.authCliExchange}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({}),
    });
    if (!res.ok) throw new ApiError(res.status, await res.text());
    return (await res.json()) as {
      verificationUrl: string;
      pollToken: string;
      expiresIn: number;
    };
  }

  async cliPoll(pollToken: string): Promise<string | null> {
    const res = await fetch(`${this.apiUrl}${ENDPOINTS.authCliPoll}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ pollToken }),
    });
    if (res.status === 200) {
      const data = (await res.json()) as { token: string };
      return data.token;
    }
    if (res.status === 202) return null;
    if (res.status === 410) throw new ApiError(410, "Code expired");
    throw new ApiError(res.status, await res.text());
  }

  async getMe(): Promise<GetMeResponse> {
    const res = await fetch(`${this.apiUrl}${ENDPOINTS.me}`, {
      method: "GET",
      headers: this.headers(),
    });
    if (!res.ok) throw new ApiError(res.status, await res.text());
    return (await res.json()) as GetMeResponse;
  }

  /** Placeholder until the taskbar gets its own parser bridge. v1.2: stub. */
  async uploadSessions(sessions: unknown[]): Promise<UploadSessionsResponse> {
    const res = await fetch(`${this.apiUrl}${ENDPOINTS.sessions}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ sessions }),
    });
    if (!res.ok) throw new ApiError(res.status, await res.text());
    return (await res.json()) as UploadSessionsResponse;
  }
}
