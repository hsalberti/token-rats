/**
 * Unit tests for the Resend-backed sendEmail helper.
 *
 * We mock global fetch so we can assert the request body without touching the
 * network. The fallback path (no API key) just verifies the stub return shape.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_FROM, sendEmail } from "./email.js";

const MSG = {
  to: "rat@example.com",
  subject: "Your week",
  html: "<p>hi</p>",
  text: "hi",
};

describe("sendEmail — stub fallback", () => {
  it("returns ok: true with a stub id when no API key is provided", async () => {
    const result = await sendEmail(MSG, undefined);
    expect(result.ok).toBe(true);
    expect(result.id).toMatch(/^stub-/);
  });

  it("returns ok: true with a stub id when the API key is an empty string", async () => {
    const result = await sendEmail(MSG, "");
    expect(result.ok).toBe(true);
    expect(result.id).toMatch(/^stub-/);
  });
});

describe("sendEmail — Resend HTTP", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("POSTs to api.resend.com with the expected headers + body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "re_123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendEmail(MSG, "re_test_xyz");

    expect(result).toEqual({ ok: true, id: "re_123" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer re_test_xyz");
    expect(headers["Content-Type"]).toBe("application/json");
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toEqual({
      from: DEFAULT_FROM,
      to: MSG.to,
      subject: MSG.subject,
      html: MSG.html,
      text: MSG.text,
    });
  });

  it("returns ok: false when Resend returns a non-2xx", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendEmail(MSG, "re_bad");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("unauthorized");
  });

  it("returns ok: false when fetch throws", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendEmail(MSG, "re_anything");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("network down");
  });

  it("returns ok: false when Resend returns 200 with no id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendEmail(MSG, "re_weird");
    expect(result.ok).toBe(false);
  });
});
