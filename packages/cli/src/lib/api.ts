/**
 * Typed HTTP client for the Token Rats API.
 *
 * Adds `X-Device-Id` + `X-Cli-Version` to every authenticated request so the
 * server can power the anonymized device list + heartbeat. The CLI version
 * lives in `package.json`; the device id is created on first run via
 * `ensureDeviceId`.
 */

import type { SessionRecord } from "@token-rats/contracts";
import type {
  DeviceHeartbeatResponse,
  GetMeDevicesResponse,
  GetMeResponse,
  UploadSessionsResponse,
} from "@token-rats/contracts";
import { ENDPOINTS } from "@token-rats/contracts";

const DEFAULT_API_URL = "https://api.tokenrats.com";

export interface ApiClientOptions {
  apiUrl?: string;
  token?: string;
  deviceId?: string;
  cliVersion?: string;
}

function isTransient(status: number): boolean {
  return status >= 500 || status === 408 || status === 429;
}

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

/** Subclass of ApiError raised on `401 { error: "device_revoked" }` so the
 *  caller can distinguish "session expired" from "device disconnected". */
export class DeviceRevokedError extends ApiError {
  constructor(body: string) {
    super(401, body);
    this.name = "DeviceRevokedError";
  }
}

export class ApiClient {
  private readonly apiUrl: string;
  private token: string | undefined;
  private readonly deviceId: string | undefined;
  private readonly cliVersion: string | undefined;

  constructor(opts: ApiClientOptions = {}) {
    this.apiUrl = (opts.apiUrl ?? DEFAULT_API_URL).replace(/\/$/, "");
    this.token = opts.token;
    this.deviceId = opts.deviceId;
    this.cliVersion = opts.cliVersion;
  }

  setToken(token: string): void {
    this.token = token;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.token) h.Authorization = `Bearer ${this.token}`;
    if (this.deviceId) h["X-Device-Id"] = this.deviceId;
    if (this.cliVersion) h["X-Cli-Version"] = this.cliVersion;
    return h;
  }

  private async fetchWithRetry(url: string, init: RequestInit, maxRetries = 3): Promise<Response> {
    let attempt = 0;
    let lastErr: unknown;
    while (attempt <= maxRetries) {
      try {
        const res = await fetch(url, init);
        if (res.ok || !isTransient(res.status)) return res;
        lastErr = new ApiError(res.status, await res.text());
      } catch (err) {
        lastErr = err;
      }
      attempt++;
      if (attempt <= maxRetries) {
        await sleep(1000 * 2 ** (attempt - 1));
      }
    }
    throw lastErr;
  }

  private async failedResponseToError(res: Response): Promise<ApiError> {
    const body = await res.text();
    if (res.status === 401 && /device_revoked/.test(body)) {
      return new DeviceRevokedError(body);
    }
    return new ApiError(res.status, body);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.apiUrl}${path}`;
    const res = await this.fetchWithRetry(url, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw await this.failedResponseToError(res);
    return res.json() as Promise<T>;
  }

  async get<T>(path: string): Promise<T> {
    const url = `${this.apiUrl}${path}`;
    const res = await this.fetchWithRetry(url, {
      method: "GET",
      headers: this.headers(),
    });
    if (!res.ok) throw await this.failedResponseToError(res);
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

  /** Poll for auth token. Returns token on success, null on pending. */
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
    if (res.status === 202) return null;
    if (res.status === 410) throw new ApiError(410, "Code expired");
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

  /** GET /v1/me/devices */
  async getDevices(): Promise<GetMeDevicesResponse> {
    return this.get<GetMeDevicesResponse>(ENDPOINTS.meDevices);
  }

  /** POST /v1/me/devices/heartbeat */
  async heartbeat(): Promise<DeviceHeartbeatResponse> {
    return this.post<DeviceHeartbeatResponse>(ENDPOINTS.meDeviceHeartbeat, {});
  }
}
