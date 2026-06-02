interface CountryFlagProps {
  country: string | null | undefined;
  className?: string;
  title?: string;
}

export function countryLabel(cc: string): string {
  try {
    const names = new Intl.DisplayNames(["en"], { type: "region" });
    return names.of(cc) ?? cc;
  } catch {
    return cc;
  }
}

/**
 * Use SVG assets instead of Unicode flags because Windows often renders
 * regional-indicator pairs as plain letters rather than a country flag.
 */
export function CountryFlag({ country, className = "h-4 w-5", title }: CountryFlagProps) {
  if (!country || country.length !== 2) return null;

  const normalized = country.toUpperCase();
  const label = countryLabel(normalized);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://flagcdn.com/${normalized.toLowerCase()}.svg`}
      alt={`${label} flag`}
      title={title ?? label}
      className={className}
      loading="lazy"
      decoding="async"
    />
  );
}
