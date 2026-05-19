/**
 * v1.2 Track AE — minimal ISO 3166-1 alpha-2 → (emoji, name) lookup.
 *
 * We deliberately ship only the ~30 highest-signal countries for our user
 * base today; anything else falls back to rendering the raw code. The flag
 * emoji is built from the code (regional indicator letters) so we don't have
 * to ship an asset.
 */

export interface CountryMeta {
  /** Display name in English. */
  name: string;
  /** Flag emoji (regional indicator letters). */
  emoji: string;
}

const NAMES: Record<string, string> = {
  AR: "Argentina",
  AU: "Australia",
  BE: "Belgium",
  BR: "Brazil",
  CA: "Canada",
  CH: "Switzerland",
  CL: "Chile",
  CN: "China",
  CO: "Colombia",
  DE: "Germany",
  ES: "Spain",
  FI: "Finland",
  FR: "France",
  GB: "United Kingdom",
  IE: "Ireland",
  IL: "Israel",
  IN: "India",
  IT: "Italy",
  JP: "Japan",
  KR: "South Korea",
  MX: "Mexico",
  NL: "Netherlands",
  NO: "Norway",
  NZ: "New Zealand",
  PL: "Poland",
  PT: "Portugal",
  SE: "Sweden",
  SG: "Singapore",
  TR: "Turkey",
  US: "United States",
  VN: "Vietnam",
  ZA: "South Africa",
};

/** Build the regional-indicator flag from a two-letter code. */
function codeToFlag(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return "";
  const offset = 0x1f1e6 - "A".charCodeAt(0);
  return String.fromCodePoint(code.charCodeAt(0) + offset, code.charCodeAt(1) + offset);
}

export function countryMeta(code: string): CountryMeta {
  const upper = code.toUpperCase();
  return {
    name: NAMES[upper] ?? upper,
    emoji: codeToFlag(upper),
  };
}
