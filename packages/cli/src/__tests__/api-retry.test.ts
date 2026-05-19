/**
 * Unit tests for API client retry logic.
 *
 * We mock the global fetch to simulate transient failures and verify
 * that the client retries on 5xx / network errors and gives up after 3 retries.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClient, ApiError } from "../lib/api.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    json: async () => body,
  } as unknown as Response;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("ApiClient retry logic", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Replace global fetch with a spy
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("succeeds immediately on 200", async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse(200, { user: { id: "1", handle: "alice", avatarUrl: null } }),
    );

    const client = new ApiClient({ apiUrl: "https://test.local" });
    // @ts-expect-error — accessing private method for test purposes
    const res = await client.fetchWithRetry("https://test.local/v1/me", {
      method: "GET",
      headers: {},
    });

    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("retries on 500 and succeeds on second attempt", async () => {
    fetchSpy
      .mockResolvedValueOnce(makeResponse(500, "internal error"))
      .mockResolvedValueOnce(makeResponse(200, { accepted: 5, duplicates: 1 }));

    const client = new ApiClient({ apiUrl: "https://test.local" });
    // Shorten delays for test speed by stubbing setTimeout
    vi.useFakeTimers();

    const promise = client.post<{ accepted: number; duplicates: number }>("/v1/sessions", {
      sessions: [],
    });

    // Advance timers past the 1s delay between retries
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.accepted).toBe(5);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it("retries on network error and succeeds on third attempt", async () => {
    fetchSpy
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(makeResponse(200, { accepted: 10, duplicates: 0 }));

    const client = new ApiClient({ apiUrl: "https://test.local" });
    vi.useFakeTimers();

    const promise = client.post<{ accepted: number; duplicates: number }>("/v1/sessions", {
      sessions: [],
    });

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.accepted).toBe(10);
    expect(fetchSpy).toHaveBeenCalledTimes(3);

    vi.useRealTimers();
  });

  it("throws after 3 retries on persistent 500", async () => {
    fetchSpy.mockResolvedValue(makeResponse(500, "server is on fire"));

    const client = new ApiClient({ apiUrl: "https://test.local" });
    vi.useFakeTimers();

    // Create the promise AND attach a rejection handler immediately so it's
    // never an unhandled rejection, even while timers are advancing.
    const promise = client.post("/v1/sessions", { sessions: [] });
    const caught = expect(promise).rejects.toBeInstanceOf(ApiError);

    await vi.runAllTimersAsync();
    await caught;

    // 1 initial + 3 retries = 4 calls
    expect(fetchSpy).toHaveBeenCalledTimes(4);

    vi.useRealTimers();
  });

  it("does NOT retry on 400 (client error)", async () => {
    fetchSpy.mockResolvedValueOnce(makeResponse(400, "bad request"));

    const client = new ApiClient({ apiUrl: "https://test.local" });
    await expect(client.post("/v1/sessions", {})).rejects.toBeInstanceOf(ApiError);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry on 401 (unauthorized)", async () => {
    fetchSpy.mockResolvedValueOnce(makeResponse(401, "unauthorized"));

    const client = new ApiClient({ apiUrl: "https://test.local" });
    await expect(client.get("/v1/me")).rejects.toBeInstanceOf(ApiError);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("retries on 429 (rate limit)", async () => {
    fetchSpy
      .mockResolvedValueOnce(makeResponse(429, "too many requests"))
      .mockResolvedValueOnce(makeResponse(200, { accepted: 1, duplicates: 0 }));

    const client = new ApiClient({ apiUrl: "https://test.local" });
    vi.useFakeTimers();

    const promise = client.post<{ accepted: number }>("/v1/sessions", {});
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.accepted).toBe(1);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it("retries on 408 (request timeout)", async () => {
    fetchSpy
      .mockResolvedValueOnce(makeResponse(408, "timeout"))
      .mockResolvedValueOnce(makeResponse(200, { accepted: 2, duplicates: 0 }));

    const client = new ApiClient({ apiUrl: "https://test.local" });
    vi.useFakeTimers();

    const promise = client.post<{ accepted: number }>("/v1/sessions", {});
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.accepted).toBe(2);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });
});
