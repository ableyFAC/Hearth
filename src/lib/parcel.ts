// Parcel pre-fill (Screen 1). Looks up baseline property facts from a parcel
// layer so onboarding can skip re-typing what a real records source already
// knows. No real source is wired up yet (fetchFromRegrid() is a stub even
// when REGRID_API_TOKEN is set), so lookupParcel() never invents facts: it
// only echoes back what the homeowner typed into the address field, parsed
// into its parts, and leaves everything it doesn't actually know (year
// built, sqft, beds/baths, lot size, property type) null for them to fill in
// or skip.

export interface ParcelFacts {
  parcel_id: string | null;
  address_line1: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  year_built: number | null;
  sqft: number | null;
  beds: number | null;
  baths: number | null;
  lot_size_sqft: number | null;
  property_type: string | null;
  source: "regrid" | "none";
}

export async function lookupParcel(rawAddress: string): Promise<ParcelFacts> {
  const token = process.env.REGRID_API_TOKEN;
  if (token) {
    try {
      const real = await fetchFromRegrid(rawAddress, token);
      if (real) return real;
    } catch (err) {
      console.error("Regrid lookup failed:", err);
    }
  }
  return blankFacts(rawAddress);
}

// TODO (needs API key): autofill ALL property facts from a real source -
// Zillow / Regrid / county records - keyed off the entered address:
//   - year built, sqft, beds/baths, lot size, property type
//   - city -> ZIP (geocode) so ZIP autofills when the city is entered
//   - permit history -> last install / repair / remodel dates per system
//     (feed these into the auto-built starter inventory in onboarding/actions.ts)
// Until this is wired up, lookupParcel() always falls through to blankFacts()
// below - it never fabricates a records lookup.
async function fetchFromRegrid(
  _address: string,
  _token: string
): Promise<ParcelFacts | null> {
  return null;
}

// No real records source is configured (or the lookup failed): return only
// what the homeowner actually typed, split into address/city/state/zip so
// they don't have to retype it, with every fact we don't actually have left
// null. Nothing here is a guess or a placeholder - it never gets shown as if
// it came from a records lookup.
function blankFacts(rawAddress: string): ParcelFacts {
  const parts = rawAddress.split(",").map((s) => s.trim()).filter(Boolean);
  const [stateGuess, zipGuess] = (parts[2] ?? "").split(" ").filter(Boolean);
  return {
    parcel_id: null,
    address_line1: parts[0] || rawAddress,
    city: parts[1] || null,
    state: stateGuess || null,
    zip: zipGuess || null,
    year_built: null,
    sqft: null,
    beds: null,
    baths: null,
    lot_size_sqft: null,
    property_type: null,
    source: "none",
  };
}
