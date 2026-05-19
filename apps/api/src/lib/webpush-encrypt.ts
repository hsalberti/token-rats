/**
 * Web Push aes128gcm payload encryption — RFC 8291.
 *
 * VENDORED CHOREOGRAPHY. This file is the encryption pipeline; the public
 * surface in `webpush.ts` is intentionally thin. We don't roll our own
 * crypto primitives — every cryptographic operation here goes through
 * `crypto.subtle` (ECDH P-256, HKDF-SHA-256, AES-128-GCM). Library
 * survey & rationale: see `implementation-notes.md` (Feature #7).
 *
 * RFC 8291 reference: https://datatracker.ietf.org/doc/html/rfc8291
 * RFC 8188 (aes128gcm framing): https://datatracker.ietf.org/doc/html/rfc8188
 *
 * The pipeline:
 *
 *   1. Generate an ephemeral P-256 key pair (the "as" key, app server).
 *   2. ECDH(as_private, ua_public)  → IKM_ECDH (32 bytes).
 *   3. HKDF(salt = auth, ikm = IKM_ECDH, info = key_info, len = 32)
 *      where key_info = "WebPush: info\0" || ua_public || as_public.
 *      → IKM_PRK (32 bytes).
 *   4. HKDF(salt = random16, ikm = IKM_PRK,
 *           info = "Content-Encoding: aes128gcm\0", len = 16) → CEK.
 *   5. HKDF(salt = random16, ikm = IKM_PRK,
 *           info = "Content-Encoding: nonce\0", len = 12)     → NONCE.
 *   6. plaintext' = payload || 0x02 (padding-delimiter byte; no extra zero pad)
 *   7. ciphertext = AES-128-GCM(key = CEK, iv = NONCE, plaintext')
 *   8. record   = salt || 0x00 0x00 0x10 0x00 || 0x41 || as_public_raw65 || ciphertext
 *      (rs=4096; idlen=65; keyid=as_public_raw_uncompressed; one-record body)
 *
 * Test vectors that drove development: RFC 8291 §5 ("Example of a Web Push
 * Message Encryption"). Implementation cross-checked against
 * Mozilla's `web-push` reference encrypter (functions: `encrypt`, `aes128gcm`)
 * — same expected wire format byte-for-byte.
 */

export interface SubscriptionKeys {
  /** UA's P-256 public key, base64url, ANSI X9.63 uncompressed (65 bytes). */
  p256dh: string;
  /** UA's auth secret, base64url, 16 bytes. */
  auth: string;
}

/* -------------------------------------------------------------------------- */
/* Base64url helpers                                                           */
/* -------------------------------------------------------------------------- */

export function base64urlToUint8Array(b64: string): Uint8Array {
  const padding = "=".repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function uint8ArrayToBase64url(arr: Uint8Array): string {
  let binary = "";
  for (const byte of arr) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/* -------------------------------------------------------------------------- */
/* HKDF + concat helpers                                                       */
/* -------------------------------------------------------------------------- */

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/**
 * One-shot HKDF using `crypto.subtle`. Workers expose HKDF as a `deriveBits`
 * algorithm — no helper needed.
 *
 * Note: `length` is in *bytes* here for ergonomics; `crypto.subtle.deriveBits`
 * takes bits, so we multiply by 8 internally.
 *
 * `salt` / `info` are typed as `Uint8Array` but the Workers `crypto.subtle`
 * params type expects `ArrayBuffer`. They're interchangeable at runtime; the
 * cast keeps TypeScript quiet without copying bytes.
 */
async function hkdf(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  lengthBytes: number,
): Promise<Uint8Array> {
  const base = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: salt as unknown as ArrayBuffer,
      info: info as unknown as ArrayBuffer,
    },
    base,
    lengthBytes * 8,
  );
  return new Uint8Array(bits);
}

/* -------------------------------------------------------------------------- */
/* P-256 helpers                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Import a UA-supplied uncompressed P-256 public key from `p256dh` (65-byte
 * X9.63 octet-string starting with 0x04) into a WebCrypto ECDH key for use
 * with `crypto.subtle.deriveBits`.
 */
async function importUaPublic(raw65: Uint8Array): Promise<CryptoKey> {
  if (raw65.length !== 65 || raw65[0] !== 0x04) {
    throw new Error("UA p256dh must be 65-byte uncompressed P-256 point");
  }
  return crypto.subtle.importKey(
    "raw",
    raw65,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    [],
  );
}

/** Export an ECDH P-256 public key as the uncompressed 65-byte octet string. */
async function exportRawPublic(key: CryptoKey): Promise<Uint8Array> {
  // exportKey('raw', ecdhKey) returns an ArrayBuffer. The Workers types
  // union it with JsonWebKey to cover the 'jwk' overload — assert away.
  const raw = (await crypto.subtle.exportKey("raw", key)) as ArrayBuffer;
  return new Uint8Array(raw);
}

/* -------------------------------------------------------------------------- */
/* Main entrypoint                                                             */
/* -------------------------------------------------------------------------- */

export interface AesGcmRecord {
  /** Full RFC 8188 aes128gcm record (header + ciphertext). */
  body: Uint8Array;
}

/**
 * Encrypt `plaintext` for the given UA subscription using the aes128gcm
 * content encoding (RFC 8188) + the Web Push key-derivation (RFC 8291).
 *
 * Returns the wire-format record ready to POST to the push service with
 * `Content-Encoding: aes128gcm`.
 *
 * `ephemeralKey` and `salt` are accepted as optional overrides so tests can
 * pin them against RFC 8291 §5 vectors.
 */
export async function encryptAes128Gcm(
  plaintext: Uint8Array,
  keys: SubscriptionKeys,
  opts?: { ephemeralKeyPair?: CryptoKeyPair; salt?: Uint8Array },
): Promise<AesGcmRecord> {
  const uaPubRaw = base64urlToUint8Array(keys.p256dh);
  const authSecret = base64urlToUint8Array(keys.auth);

  // 1. Ephemeral app-server keypair. `generateKey` returns a union that TS
  //    can't narrow against the algorithm param; cast to CryptoKeyPair (ECDH
  //    is an asymmetric algorithm — always a keypair at runtime).
  const ephemeral =
    opts?.ephemeralKeyPair ??
    ((await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveBits"],
    )) as CryptoKeyPair);

  const asPubRaw = await exportRawPublic(ephemeral.publicKey);

  // 2. ECDH(as_private, ua_public). The Workers types declare the partner
  //    key as `$public`, but every WebCrypto runtime (workerd + Node + browsers)
  //    expects the standard `public` parameter at runtime. Type-cast to
  //    bypass the workers-types quirk.
  const uaPubKey = await importUaPublic(uaPubRaw);
  const ecdhBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: uaPubKey } as unknown as SubtleCryptoDeriveKeyAlgorithm,
    ephemeral.privateKey,
    256,
  );
  const ikmEcdh = new Uint8Array(ecdhBits);

  // 3. Derive IKM_PRK via HKDF with the UA's auth secret as salt.
  // key_info = "WebPush: info\0" || ua_public || as_public
  const keyInfo = concatBytes(
    new TextEncoder().encode("WebPush: info\0"),
    uaPubRaw,
    asPubRaw,
  );
  const ikmPrk = await hkdf(ikmEcdh, authSecret, keyInfo, 32);

  // 4. CEK + nonce — both keyed off a random 16-byte salt (overridable).
  const salt = opts?.salt ?? crypto.getRandomValues(new Uint8Array(16));

  const cekBytes = await hkdf(
    ikmPrk,
    salt,
    new TextEncoder().encode("Content-Encoding: aes128gcm\0"),
    16,
  );
  const nonce = await hkdf(
    ikmPrk,
    salt,
    new TextEncoder().encode("Content-Encoding: nonce\0"),
    12,
  );

  const cek = await crypto.subtle.importKey("raw", cekBytes, "AES-GCM", false, ["encrypt"]);

  // 5. Append the padding delimiter byte (0x02 = end of payload, no extra
  //    zero-padding for a single record).
  const plaintextPadded = concatBytes(plaintext, new Uint8Array([0x02]));

  // 6. AES-128-GCM encrypt. Same Uint8Array→ArrayBuffer cast story as HKDF.
  const cipherBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce as unknown as ArrayBuffer },
    cek,
    plaintextPadded,
  );
  const ciphertext = new Uint8Array(cipherBuf);

  // 7. Build the aes128gcm record header per RFC 8188:
  //      salt (16) || rs (4, big-endian) || idlen (1) || keyid (idlen bytes)
  //    For Web Push we set:
  //      rs    = 4096
  //      idlen = 65
  //      keyid = as_public_raw (the 65-byte uncompressed P-256 point)
  const rsBytes = new Uint8Array([0x00, 0x00, 0x10, 0x00]); // 4096
  const idlenBytes = new Uint8Array([0x41]); // 65

  const body = concatBytes(salt, rsBytes, idlenBytes, asPubRaw, ciphertext);
  return { body };
}
