/**
 * A tiny, pure, synchronous FNV-1a (32-bit) hash used to produce deterministic
 * dedupeKeys. No native Node modules, no npm deps — just arithmetic.
 *
 * Output: lowercase hex string (8 characters, 4 bytes).
 */

const FNV_PRIME = 0x01000193;
const FNV_OFFSET = 0x811c9dc5;

/**
 * Compute FNV-1a over a UTF-8 string and return the result as an 8-char hex
 * string. The value is computed over the full Unicode code-point sequence
 * (each code point's bytes in UTF-16 order) — deterministic across all
 * JS engines.
 */
export function fnv1aHex(input: string): string {
  let hash = FNV_OFFSET;
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    // XOR with low byte then high byte so multi-byte chars are handled
    hash ^= code & 0xff;
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
    if (code > 0xff) {
      hash ^= (code >>> 8) & 0xff;
      hash = Math.imul(hash, FNV_PRIME) >>> 0;
    }
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Compute a stable dedupeKey for a SessionRecord.
 *
 * Key material: `source|model|startedAt|inTokens|outTokens`
 * Result: the FNV-1a hex digest of that pipe-separated string.
 */
export function computeDedupeKey(
  source: string,
  model: string,
  startedAt: number,
  inTokens: number,
  outTokens: number,
): string {
  const material = `${source}|${model}|${startedAt}|${inTokens}|${outTokens}`;
  return fnv1aHex(material);
}
