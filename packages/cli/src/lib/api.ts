import type {
  GetMeResponse,
  UploadSessionsRequest,
  UploadSessionsResponse,
} from "@token-rats/contracts";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Is this status code retryable? */
function isRetryable(status: number): boolean {
  // 408 Request Timeout, 429 Too Many Requests, 5xx Server Errors
  return status === 408 || status === 429 || status >= 500;
}

async function fetchJson<T>(url: string, options: RequestInit & { token?: string }): Promise<T> {
  const { token, ...fetchOptions } = options;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": `token-rats-cli/0.1.0 node/${process.version}`,
    ...(fetchOptions.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(url, { ...fetchOptions, headers });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const msg = `HTTP ${res.status}: ${body.slice(0, 200)}`;
    throw new ApiError(res.status, msg, isRetryable(res.status));
  }

  return res.json() as Promise<T>;
}

/** Retry with exponential backoff: 1s → 2s → 4s. */
async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastErr: Error = new Error("unknown");
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err as Error;
      const apiErr = err instanceof ApiError ? err : null;
      // Don't retry non-retryable API errors
      if (apiErr && !apiErr.retryable) throw err;
      if (attempt < maxAttempts - 1) {
        const delayMs = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  throw lastErr;
}

export interface CliExchangeResponse {
  verificationUrl: string;
  pollToken: string;
  expiresIn: number;
}

export interface CliPollResponse {
  token?: string;
  status?: "pending";
}

export class ApiClient {
  constructor(private readonly baseUrl: string) {}

  /** Initiate device-code auth flow. */
  async cliExchange(): Promise<CliExchangeResponse> {
    return fetchJson<CliExchangeResponse>(`${this.baseUrl}/v1/auth/cli/exchange`, {
      method: "POST",
      body: "{}",
    });
  }

  /**
   * Poll for auth completion.
   * Returns token on success, null if still pending.
   * Throws ApiError with status 410 if expired.
   */
  async cliPoll(pollToken: string): Promise<string | null> {
    const res = await fetchJson<CliPollResponse>(`${this.baseUrl}/v1/auth/cli/poll`, {
      method: "POST",
      body: JSON.stringify({ pollToken }),
    });
    if (res.token) return res.token;
    return null;
  }

  /** Get the current user's profile. */
  async getMe(token: string): Promise<GetMeResponse> {
    return fetchJson<GetMeResponse>(`${this.baseUrl}/v1/me`, {
      method: "GET",
      token,
    });
  }

  /**
   * Upload a batch of sessions. Retries on transient failures.
   */
  async uploadSessions(
    token: string,
    body: UploadSessionsRequest,
  ): Promise<UploadSessionsResponse> {
    return withRetry(() =>
      fetchJson<UploadSessionsResponse>(`${this.baseUrl}/v1/sessions`, {
        method: "POST",
        token,
        body: JSON.stringify(body),
      }),
    );
  }
}

export { withRetry };
