/**
 * Typed HTTP client for the Token Rats API.
 * Uses plain Node fetch (Node ≥18). Retries on transient errors
 * (network failures, 5xx, 408, 429) with exponential backoff.
 */

import type { SessionRecord } from "@token-rats/contracts";
import type { GetMeResponse, UploadSessionsResponse } from "@token-rats/contracts";
import { ENDPOINTS } from "@token-rats/contracts";

const DEFAULT_API_URL = "https://api.tokenrats.com";

export interface ApiClientOptions {
  apiUrl?: string;
  token?: string;
}

/** Errors that should trigger a retry. */
function isTransient(status: number): boolean {
  return status >= 500 || status === 408 || status === 429;
}

/** Sleep for `ms` milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  private token: string | undefined;

  constructor(opts: ApiClientOptions = {}) {
    this.apiUrl = (opts.apiUrl ?? DEFAULT_API_URL).replace(/\/$/, "");
    this.token = opts.token;
  }

  setToken(token: string): void {
    this.token = token;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.token) {
      h.Authorization = `Bearer ${this.token}`;
    }
    return h;
  }

  /** Perform a fetch with retry+backoff. maxRetries=3, delays: 1s, 2s, 4s. */
  private async fetchWithRetry(url: string, init: RequestInit, maxRetries = 3): Promise<Response> {
    let attempt = 0;
    let lastErr: unknown;
    while (attempt <= maxRetries) {
      try {
        const res = await fetch(url, init);
        if (res.ok || !isTransient(res.status)) {
          return res;
        }
        // Transient server error — retry
        lastErr = new ApiError(res.status, await res.text());
      } catch (err) {
        // Network error — retry
        lastErr = err;
      }
      attempt++;
      if (attempt <= maxRetries) {
        await sleep(1000 * 2 ** (attempt - 1));
      }
    }
    throw lastErr;
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.apiUrl}${path}`;
    const res = await this.fetchWithRetry(url, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new ApiError(res.status, await res.text());
    }
    return res.json() as Promise<T>;
  }

  async get<T>(path: string): Promise<T> {
    const url = `${this.apiUrl}${path}`;
    const res = await this.fetchWithRetry(url, {
      method: "GET",
      headers: this.headers(),
    });
    if (!res.ok) {
      throw new ApiError(res.status, await res.text());
    }
    return res.json() as Promise<T>;
  }

  /** Initiate device-code flow. */
  async cliExchange(): Promise<{
    verificationUrl: string;
    pollToken: string;
    expiresIn: number;
  }> {
    return this.post(ENDPOINTS.authCliExchange, {});
  }

  /** Poll for auth token. Returns token on success, null on pending, throws on error. */
  async cliPoll(pollToken: string): Promise<string | null> {
    const url = `${this.apiUrl}${ENDPOINTS.authCliPoll}`;
    const res = await fetch(url, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ pollToken }),
    });

    if (res.status === 200) {
      const data = (await res.json()) as { token: string };
      return data.token;
    }
    if (res.status === 202) {
      return null; // still pending
    }
    if (res.status === 410) {
      throw new ApiError(410, "Code expired");
    }
    throw new ApiError(res.status, await res.text());
  }

  /** GET /v1/me */
  async getMe(): Promise<GetMeResponse> {
    return this.get<GetMeResponse>(ENDPOINTS.me);
  }

  /** Upload sessions in one batch (≤500). */
  async uploadSessions(sessions: SessionRecord[]): Promise<UploadSessionsResponse> {
    return this.post<UploadSessionsResponse>(ENDPOINTS.sessions, { sessions });
  }
}
