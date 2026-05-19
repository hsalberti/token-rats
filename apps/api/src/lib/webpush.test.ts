/**
 * Unit tests for the Web Push aes128gcm encryption pipeline (RFC 8291).
 *
 * The byte-for-byte test vector is taken from RFC 8291 §5 ("Example").
 * Source: https://datatracker.ietf.org/doc/html/rfc8291#section-5
 *
 * Vectors used (all base64url-encoded as in the RFC):
 *   plaintext   = "When I grow up, I want to be a watermelon"
 *   as_private  = yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw
 *   as_public   = BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8
 *   ua_public   = BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4
 *   auth_secret = BTBZMqHH6r4Tts7J_aSIgg
 *   salt        = DGv6ra1nlYgDCS1FRnbzlw
 *
 * Expected encrypted body (header || ciphertext) base64url:
 *   DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml
 *   mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT
 *   pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  base64urlToUint8Array,
  encryptPayload,
  sendWebPush,
  uint8ArrayToBase64url,
} from "./webpush.js";

const VEC = {
  plaintext: "When I grow up, I want to be a watermelon",
  asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  asPublic:
    "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  uaPublic:
    "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  authSecret: "BTBZMqHH6r4Tts7J_aSIgg",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  expected:
    "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};

/**
 * Import the fixed RFC test-vector AS keypair as a CryptoKeyPair so we can
 * inject it into encryptPayload (which otherwise generates a random one).
 */
async function importFixedAsKeyPair(): Promise<CryptoKeyPair> {
  const dBytes = base64urlToUint8Array(VEC.asPrivate);
  const pub = base64urlToUint8Array(VEC.asPublic);
  const x = uint8ArrayToBase64url(pub.slice(1, 33));
  const y = uint8ArrayToBase64url(pub.slice(33, 65));
  const d = uint8ArrayToBase64url(dBytes);

  const privateKey = await crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", d, x, y, ext: true },
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const publicKey = await crypto.subtle.importKey(
    "raw",
    pub,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    [],
  );
  return { privateKey, publicKey };
}

describe("encryptPayload — RFC 8291 §5 test vector", () => {
  it("produces the exact ciphertext from the RFC example", async () => {
    const asKeyPair = await importFixedAsKeyPair();
    const result = await encryptPayload({
      plaintext: new TextEncoder().encode(VEC.plaintext),
      uaPublic: base64urlToUint8Array(VEC.uaPublic),
      authSecret: base64urlToUint8Array(VEC.authSecret),
      asKeyPair,
      salt: base64urlToUint8Array(VEC.salt),
    });

    expect(uint8ArrayToBase64url(result.body)).toBe(VEC.expected);
  });

  it("embeds the salt, rs=4096, and keyid in the header", async () => {
    const asKeyPair = await importFixedAsKeyPair();
    const { body } = await encryptPayload({
      plaintext: new TextEncoder().encode(VEC.plaintext),
      uaPublic: base64urlToUint8Array(VEC.uaPublic),
      authSecret: base64urlToUint8Array(VEC.authSecret),
      asKeyPair,
      salt: base64urlToUint8Array(VEC.salt),
    });

    // salt = first 16 bytes
    expect(uint8ArrayToBase64url(body.slice(0, 16))).toBe(VEC.salt);
    // rs = next 4 bytes big-endian = 4096
    const rs = (body[16]! << 24) | (body[17]! << 16) | (body[18]! << 8) | body[19]!;
    expect(rs).toBe(4096);
    // idlen = 65
    expect(body[20]).toBe(65);
    // keyid (next 65 bytes) = as_public
    expect(uint8ArrayToBase64url(body.slice(21, 86))).toBe(VEC.asPublic);
  });
});

describe("encryptPayload — input validation", () => {
  it("rejects a ua public key that isn't 65 bytes / 0x04-prefixed", async () => {
    await expect(
      encryptPayload({
        plaintext: new TextEncoder().encode("hi"),
        uaPublic: new Uint8Array([1, 2, 3]),
        authSecret: base64urlToUint8Array(VEC.authSecret),
      }),
    ).rejects.toThrow(/uncompressed/);
  });

  it("rejects an auth secret that isn't 16 bytes", async () => {
    await expect(
      encryptPayload({
        plaintext: new TextEncoder().encode("hi"),
        uaPublic: base64urlToUint8Array(VEC.uaPublic),
        authSecret: new Uint8Array(8),
      }),
    ).rejects.toThrow(/auth secret/);
  });
});

describe("base64urlToUint8Array", () => {
  it("round-trips arbitrary bytes", () => {
    const bytes = new Uint8Array([0, 1, 254, 255, 42, 7]);
    expect(base64urlToUint8Array(uint8ArrayToBase64url(bytes))).toEqual(bytes);
  });

  it("decodes the RFC vector salt to 16 bytes", () => {
    expect(base64urlToUint8Array(VEC.salt).length).toBe(16);
  });
});

describe("sendWebPush", () => {
  const origFetch = globalThis.fetch;
  // A valid raw 32-byte P-256 private key (RFC 8291 AS private from §5).
  const vapidPrivateKey = VEC.asPrivate;
  // We need a *matching* uncompressed public key for JWK import in
  // buildVapidJwt. The RFC's as_public corresponds to as_private.
  const vapidPublicKey = VEC.asPublic;
  const subject = "mailto:noreply@example.com";

  const sub = {
    endpoint: "https://push.example.com/send/abc123",
    p256dh: VEC.uaPublic,
    auth: VEC.authSecret,
  };

  beforeEach(() => {
    // default mock; individual tests override.
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 201 })) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = origFetch;
    vi.restoreAllMocks();
  });

  it("returns ok:false / invalid-subscription for malformed base64 p256dh", async () => {
    const result = await sendWebPush(
      { endpoint: sub.endpoint, p256dh: "not*valid*base64!", auth: VEC.authSecret },
      { title: "x", body: "y" },
      vapidPrivateKey,
      vapidPublicKey,
      subject,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid-subscription");
  });

  it("returns ok:false / invalid-subscription for an unparseable endpoint URL", async () => {
    const result = await sendWebPush(
      { ...sub, endpoint: "not-a-url" },
      { title: "x", body: "y" },
      vapidPrivateKey,
      vapidPublicKey,
      subject,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid-subscription");
  });

  it("POSTs aes128gcm + VAPID headers to the endpoint and returns ok on 201", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 201 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await sendWebPush(
      sub,
      { title: "Hello", body: "World", url: "/app" },
      vapidPrivateKey,
      vapidPublicKey,
      subject,
    );
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const [url, init] = call;
    expect(url).toBe(sub.endpoint);
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Encoding"]).toBe("aes128gcm");
    expect(headers["Content-Type"]).toBe("application/octet-stream");
    expect(headers.TTL).toBe(String(60 * 60 * 24));
    expect(headers.Authorization).toMatch(/^vapid t=[^,]+, k=/);
    expect(headers.Authorization).toContain(`k=${vapidPublicKey}`);
    // Body is the encrypted payload — at minimum the 86-byte header + GCM tag.
    const body = init.body as ArrayBuffer | Uint8Array;
    const bodyBytes = body instanceof Uint8Array ? body : new Uint8Array(body as ArrayBuffer);
    expect(bodyBytes.length).toBeGreaterThan(86 + 16);
  });

  it("maps 410 Gone to invalid-subscription", async () => {
    globalThis.fetch = (vi.fn(
      async () => new Response(null, { status: 410 }),
    ) as unknown) as typeof fetch;

    const result = await sendWebPush(
      sub,
      { title: "x", body: "y" },
      vapidPrivateKey,
      vapidPublicKey,
      subject,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid-subscription");
      expect(result.status).toBe(410);
    }
  });

  it("maps 500 to delivery-failed", async () => {
    globalThis.fetch = (vi.fn(
      async () => new Response(null, { status: 500 }),
    ) as unknown) as typeof fetch;

    const result = await sendWebPush(
      sub,
      { title: "x", body: "y" },
      vapidPrivateKey,
      vapidPublicKey,
      subject,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("delivery-failed");
      expect(result.status).toBe(500);
    }
  });
});
