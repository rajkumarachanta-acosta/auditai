// Adzuna only covers these markets. Maps common country names/codes the profile
// might contain to the 2-letter code Adzuna's API expects.
const ADZUNA_MARKETS: Record<string, string> = {
  us: "us", usa: "us", "united states": "us",
  gb: "gb", uk: "gb", "united kingdom": "gb",
  de: "de", germany: "de",
  ca: "ca", canada: "ca",
  au: "au", australia: "au",
  in: "in", india: "in",
  fr: "fr", france: "fr",
  nl: "nl", netherlands: "nl",
  sg: "sg", singapore: "sg",
  ie: "ie", ireland: "ie",
  nz: "nz", "new zealand": "nz",
  za: "za", "south africa": "za",
  br: "br", brazil: "br",
  mx: "mx", mexico: "mx",
  es: "es", spain: "es",
  it: "it", italy: "it",
  pl: "pl", poland: "pl",
  at: "at", austria: "at",
  ch: "ch", switzerland: "ch",
};

export function adzunaCountriesFromProfile(locations: string[], visaToCountries: string[]): string[] {
  const names = [...locations, ...visaToCountries].map((s) => s.trim().toLowerCase());
  const codes = new Set<string>();
  for (const n of names) {
    const code = ADZUNA_MARKETS[n];
    if (code) codes.add(code);
  }
  if (codes.size === 0) codes.add("us"); // sensible default market
  return [...codes];
}
